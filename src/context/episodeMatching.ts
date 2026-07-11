import type { ContextualMediaEvidence, ContextualMatch } from "./evidence";

export interface EpisodeCandidate {
  airDate?: string | null;
  episodeNumber: number;
  episodeTitle: string;
  overview?: string;
  seasonNumber: number;
}

export interface RankedEpisodeCandidate {
  candidate: EpisodeCandidate;
  evidence: string[];
  score: number;
}

export interface EpisodeMatchOptions {
  ambiguityMargin?: number;
  exactThreshold?: number;
  likelyThreshold?: number;
  selectionLimit?: number;
}

const DEFAULT_EXACT_THRESHOLD = 0.84;
const DEFAULT_LIKELY_THRESHOLD = 0.68;
const DEFAULT_AMBIGUITY_MARGIN = 0.08;
const DEFAULT_SELECTION_LIMIT = 3;

export function rankEpisodeCandidates(
  episodes: EpisodeCandidate[],
  evidence: ContextualMediaEvidence
): RankedEpisodeCandidate[] {
  return episodes
    .map((candidate) => scoreEpisodeCandidate(candidate, evidence))
    .sort((left, right) => right.score - left.score);
}

export function selectEpisodeMatch(
  episodes: EpisodeCandidate[],
  evidence: ContextualMediaEvidence,
  series: { imdbId?: string; seriesTitle: string; tmdbId?: number },
  options: EpisodeMatchOptions = {}
): ContextualMatch {
  const exactThreshold = options.exactThreshold ?? DEFAULT_EXACT_THRESHOLD;
  const likelyThreshold = options.likelyThreshold ?? DEFAULT_LIKELY_THRESHOLD;
  const ambiguityMargin = options.ambiguityMargin ?? DEFAULT_AMBIGUITY_MARGIN;
  const selectionLimit = options.selectionLimit ?? DEFAULT_SELECTION_LIMIT;
  const ranked = rankEpisodeCandidates(filterBySeasonHints(episodes, evidence), evidence);
  const best = ranked[0];
  const runnerUp = ranked[1];
  const alternatives = ranked.slice(0, selectionLimit).map((episode) => ({
    episodeNumber: episode.candidate.episodeNumber,
    evidence: episode.evidence,
    imdbId: series.imdbId,
    mediaType: "series" as const,
    seasonNumber: episode.candidate.seasonNumber,
    title: episode.candidate.episodeTitle,
    tmdbId: series.tmdbId
  }));

  if (!best) {
    return {
      alternatives: [],
      confidence: "medium",
      evidence: ["Series identified. Exact episode remains uncertain."],
      imdbId: series.imdbId,
      matchLevel: "exact_series",
      seriesTitle: series.seriesTitle,
      tmdbId: series.tmdbId
    };
  }

  const clearLead = !runnerUp || best.score - runnerUp.score >= ambiguityMargin;
  const explicitEpisodeMatch =
    evidence.seasonHints.includes(best.candidate.seasonNumber) &&
    evidence.episodeHints.includes(best.candidate.episodeNumber);

  if (clearLead && explicitEpisodeMatch && (best.score >= exactThreshold || best.evidence.includes("Season and episode were explicitly stated."))) {
    return buildEpisodeMatch("exact_episode", "high", best, alternatives, series);
  }

  if (best.score >= likelyThreshold && clearLead && best.evidence.length >= 2) {
    return buildEpisodeMatch("likely_episode", "medium", best, alternatives, series);
  }

  if (ranked.length > 1 && best.score >= likelyThreshold - 0.12) {
    return {
      alternatives,
      confidence: "low",
      evidence: ["Series identified. Several episodes share the available clues."],
      imdbId: series.imdbId,
      matchLevel: "ambiguous_episode",
      seriesTitle: series.seriesTitle,
      tmdbId: series.tmdbId
    };
  }

  return {
    alternatives,
    confidence: "medium",
    evidence: ["Series identified. Exact episode remains uncertain."],
    imdbId: series.imdbId,
    matchLevel: "exact_series",
    seriesTitle: series.seriesTitle,
    tmdbId: series.tmdbId
  };
}

function scoreEpisodeCandidate(
  candidate: EpisodeCandidate,
  evidence: ContextualMediaEvidence
): RankedEpisodeCandidate {
  const reasons: string[] = [];
  let score = 0;
  let total = 0;

  total += 0.28;
  if (evidence.seasonHints.includes(candidate.seasonNumber) && evidence.episodeHints.includes(candidate.episodeNumber)) {
    score += 0.28;
    reasons.push("Season and episode were explicitly stated.");
  } else if (evidence.seasonHints.includes(candidate.seasonNumber) || evidence.episodeHints.includes(candidate.episodeNumber)) {
    score += 0.12;
    reasons.push("Season or episode notation partially matches.");
  }

  total += 0.2;
  const titleScore = Math.max(
    ...[evidence.cleanedTitle, ...evidence.sceneDescriptions, ...evidence.dialogueFragments]
      .filter(Boolean)
      .map((text) => normalizedTextSimilarity(text, candidate.episodeTitle)),
    0
  );
  if (titleScore >= 0.72) reasons.push("Episode title closely matches the available text.");
  score += titleScore * 0.2;

  total += 0.18;
  const characterMatches = countEntityOverlap(evidence.characters, `${candidate.episodeTitle} ${candidate.overview ?? ""}`);
  if (characterMatches >= 2) reasons.push("Multiple character names match this episode.");
  else if (characterMatches === 1) reasons.push("A character name matches this episode.");
  score += Math.min(1, characterMatches / 2) * 0.18;

  total += 0.22;
  const plotText = `${candidate.episodeTitle} ${candidate.overview ?? ""}`;
  const sceneScore = Math.max(...evidence.sceneDescriptions.map((scene) => normalizedTextSimilarity(scene, plotText)), 0);
  if (sceneScore >= 0.45) reasons.push("Scene description overlaps the episode synopsis.");
  score += sceneScore * 0.22;

  total += 0.12;
  const dialogueScore = Math.max(...evidence.dialogueFragments.map((dialogue) => normalizedTextSimilarity(dialogue, plotText)), 0);
  if (dialogueScore >= 0.45) reasons.push("Quoted dialogue overlaps the episode metadata.");
  score += dialogueScore * 0.12;

  return {
    candidate,
    evidence: reasons,
    score: roundScore(total > 0 ? score / total : 0)
  };
}

function buildEpisodeMatch(
  matchLevel: "exact_episode" | "likely_episode",
  confidence: "high" | "medium",
  best: RankedEpisodeCandidate,
  alternatives: ContextualMatch["alternatives"],
  series: { imdbId?: string; seriesTitle: string; tmdbId?: number }
): ContextualMatch {
  return {
    alternatives,
    confidence,
    episodeNumber: best.candidate.episodeNumber,
    episodeTitle: best.candidate.episodeTitle,
    evidence: best.evidence,
    imdbId: series.imdbId,
    matchLevel,
    seasonNumber: best.candidate.seasonNumber,
    seriesTitle: series.seriesTitle,
    tmdbId: series.tmdbId
  };
}

function filterBySeasonHints(
  episodes: EpisodeCandidate[],
  evidence: ContextualMediaEvidence
): EpisodeCandidate[] {
  if (evidence.seasonHints.length === 0) return episodes;
  const filtered = episodes.filter((episode) => evidence.seasonHints.includes(episode.seasonNumber));
  return filtered.length > 0 ? filtered : episodes;
}

function countEntityOverlap(entities: string[], text: string): number {
  const normalizedText = normalizeComparable(text);
  return entities.filter((entity) => normalizedText.includes(normalizeComparable(entity))).length;
}

export function normalizedTextSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return roundScore(intersection / union);
}

function tokenize(value: string): string[] {
  return normalizeComparable(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

function normalizeComparable(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
