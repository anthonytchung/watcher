import type { ContextualMediaEvidence } from "../context/evidence";
import type { TmdbCandidate, TmdbCandidateMediaType } from "./types";

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.74;
export const DEFAULT_SELECTION_LIMIT = 3;
export const DEFAULT_MINIMUM_SCORE_MARGIN = 0.08;

const SCORE_WEIGHTS = {
  actorMatch: 0.12,
  channelName: 0.08,
  mediaType: 0.12,
  releaseYear: 0.12,
  seasonEpisode: 0.08,
  titleSimilarity: 0.48
} satisfies Record<keyof CandidateScoreBreakdown, number>;

const WORD_SPLIT_PATTERN = /\s+/;
const MULTISPACE_PATTERN = /\s+/g;
const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/g;
const SEASON_EPISODE_PATTERNS = [
  /\bs(?:eason)?\s*(\d{1,2})(?:\s*[,/:-]?\s*e(?:p(?:isode)?)?\s*(\d{1,3}))?\b/i,
  /\bs(\d{1,2})\s*e(\d{1,3})\b/i,
  /\b(\d{1,2})x(\d{1,3})\b/i,
  /\be(?:p(?:isode)?)?\s*(\d{1,3})\b/i
];
const TV_HINT_PATTERN =
  /\b(?:season|episode|series|show|finale|pilot|s\d{1,2}\s*e\d{1,3}|\d{1,2}x\d{1,3})\b/i;
const MOVIE_HINT_PATTERN = /\b(?:movie|film|featurette)\b/i;

const STREAMING_OR_TV_CHANNEL_PATTERN =
  /\b(?:netflix|hbo|max|hulu|prime video|disney\+|apple tv|peacock|paramount\+|showtime|starz|fx networks?|amc)\b/i;
const MOVIE_CHANNEL_PATTERN =
  /\b(?:movieclips|trailers?|warner bros|universal pictures|paramount pictures|sony pictures|20th century studios|lionsgate|a24|focus features)\b/i;

export interface CandidateScoringContext {
  alternativeQueries?: string[];
  channelName?: string;
  cleanedTitle: string;
  contextualEvidence?: ContextualMediaEvidence;
  youtubeDescription?: string;
  youtubeTitle?: string;
}

export interface CandidateScoringOptions {
  confidenceThreshold?: number;
  selectionLimit?: number;
  minimumScoreMargin?: number;
}

export interface CandidateScoreBreakdown {
  actorMatch: number;
  channelName: number;
  mediaType: number;
  releaseYear: number;
  seasonEpisode: number;
  titleSimilarity: number;
}

export interface CandidateScoreDetails {
  activeFactors: Array<keyof CandidateScoreBreakdown>;
  expectedMediaType: TmdbCandidateMediaType | null;
  matchedActors: string[];
  matchedChannelNames: string[];
  sourceSeasonEpisode: SeasonEpisodeNotation | null;
  sourceYears: string[];
}

export interface ScoredTmdbCandidate {
  breakdown: CandidateScoreBreakdown;
  candidate: TmdbCandidate;
  confidence: number;
  confidenceLevel: "high" | "medium" | "low";
  details: CandidateScoreDetails;
  reasons: string[];
}

export interface BestTmdbCandidateSelection {
  candidate: ScoredTmdbCandidate;
  confidenceThreshold: number;
  kind: "best_match";
}

export interface TmdbCandidateSelectionRequired {
  candidates: ScoredTmdbCandidate[];
  confidenceThreshold: number;
  kind: "needs_selection";
}

export type TmdbCandidateSelection = BestTmdbCandidateSelection | TmdbCandidateSelectionRequired;

interface SeasonEpisodeNotation {
  episode: number | null;
  season: number | null;
}

interface ContextAnalysis {
  actorSourceText: string;
  expectedMediaType: TmdbCandidateMediaType | null;
  sourceSeasonEpisode: SeasonEpisodeNotation | null;
  sourceText: string;
  sourceYears: string[];
}

interface SignalAvailability {
  actorMatch: boolean;
  channelName: boolean;
  mediaType: boolean;
  releaseYear: boolean;
  seasonEpisode: boolean;
  titleSimilarity: true;
}

export function selectTmdbCandidate(
  candidates: TmdbCandidate[],
  context: CandidateScoringContext,
  options: CandidateScoringOptions = {}
): TmdbCandidateSelection {
  const confidenceThreshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const selectionLimit = options.selectionLimit ?? DEFAULT_SELECTION_LIMIT;
  const minimumScoreMargin = options.minimumScoreMargin ?? DEFAULT_MINIMUM_SCORE_MARGIN;
  const rankedCandidates = rankTmdbCandidates(candidates, context);
  const bestCandidate = rankedCandidates[0];
  const runnerUp = rankedCandidates[1];
  const hasClearLead = !runnerUp || bestCandidate.confidence - runnerUp.confidence >= minimumScoreMargin;

  if (bestCandidate && bestCandidate.confidence >= confidenceThreshold && hasClearLead) {
    return {
      candidate: bestCandidate,
      confidenceThreshold,
      kind: "best_match"
    };
  }

  return {
    candidates: rankedCandidates.slice(0, selectionLimit),
    confidenceThreshold,
    kind: "needs_selection"
  };
}

export function rankTmdbCandidates(
  candidates: TmdbCandidate[],
  context: CandidateScoringContext
): ScoredTmdbCandidate[] {
  const analysis = analyzeContext(context);
  const availability = getSignalAvailability(candidates, context, analysis);

  return candidates
    .map((candidate) => scoreCandidate(candidate, context, analysis, availability))
    .sort(compareScoredCandidates);
}

export function normalizedTitleSimilarity(sourceTitle: string, candidateTitle: string): number {
  const source = normalizeComparableText(sourceTitle);
  const candidate = normalizeComparableText(candidateTitle);

  if (!source || !candidate) {
    return 0;
  }

  if (source === candidate) {
    return 1;
  }

  const containsScore = source.includes(candidate) || candidate.includes(source) ? 0.92 : 0;
  const tokenScore = tokenJaccard(source, candidate);
  const bigramScore = diceCoefficient(source, candidate);

  return roundScore(Math.max(containsScore, tokenScore * 0.65 + bigramScore * 0.35));
}

function scoreCandidate(
  candidate: TmdbCandidate,
  context: CandidateScoringContext,
  analysis: ContextAnalysis,
  availability: SignalAvailability
): ScoredTmdbCandidate {
  const sourceQueries = [
    ...(context.contextualEvidence?.probableTitles ?? []),
    context.cleanedTitle,
    ...(context.alternativeQueries ?? [])
  ].filter(Boolean);
  const titleSimilarity = Math.max(...sourceQueries.flatMap((query) => [
    normalizedTitleSimilarity(query, candidate.title),
    normalizedTitleSimilarity(query, candidate.originalTitle)
  ]));
  const matchedActors = matchCandidateActors(candidate.actorNames, analysis.actorSourceText);
  const matchedChannelNames = matchChannelNames(candidate, context.channelName);
  const breakdown: CandidateScoreBreakdown = {
    actorMatch: scoreActorMatch(matchedActors.length, candidate.actorNames.length),
    channelName: scoreChannelName(candidate, context.channelName, matchedChannelNames),
    mediaType: scoreMediaType(candidate.mediaType, analysis.expectedMediaType),
    releaseYear: scoreReleaseYear(candidate.year, analysis.sourceYears),
    seasonEpisode: scoreSeasonEpisode(candidate, analysis.sourceSeasonEpisode),
    titleSimilarity
  };
  const activeFactors = getActiveFactors(availability);

  const confidence = combineScores(breakdown, activeFactors);

  return {
    breakdown,
    candidate,
    confidence,
    confidenceLevel: confidence >= 0.8 ? "high" : confidence >= 0.55 ? "medium" : "low",
    details: {
      activeFactors,
      expectedMediaType: analysis.expectedMediaType,
      matchedActors,
      matchedChannelNames,
      sourceSeasonEpisode: analysis.sourceSeasonEpisode,
      sourceYears: analysis.sourceYears
    },
    reasons: buildReasons(breakdown, matchedActors, matchedChannelNames)
  };
}

function buildReasons(
  breakdown: CandidateScoreBreakdown,
  matchedActors: string[],
  matchedChannelNames: string[]
): string[] {
  const reasons: string[] = [];
  if (breakdown.titleSimilarity >= 0.9) reasons.push("Title closely matches");
  if (breakdown.releaseYear >= 0.75) reasons.push("Release year matches");
  if (breakdown.mediaType === 1) reasons.push("Movie or series type matches");
  if (matchedActors.length) reasons.push(`Cast mentioned: ${matchedActors.slice(0, 2).join(", ")}`);
  if (matchedChannelNames.length) reasons.push(`Official source: ${matchedChannelNames[0]}`);
  if (breakdown.seasonEpisode === 1) reasons.push("Season or episode notation matches a series");
  return reasons.slice(0, 3);
}

function analyzeContext(context: CandidateScoringContext): ContextAnalysis {
  const evidence = context.contextualEvidence;
  const sourceText = [
    context.cleanedTitle,
    context.youtubeTitle,
    context.youtubeDescription,
    context.channelName,
    ...(evidence?.probableTitles ?? []),
    ...(evidence?.characters ?? []),
    ...(evidence?.actors ?? []),
    ...(evidence?.dialogueFragments ?? []),
    ...(evidence?.sceneDescriptions ?? [])
  ]
    .filter(Boolean)
    .join(" ");
  const sourceSeasonEpisode = parseSeasonEpisode(sourceText);
  const contextualSeasonEpisode = evidence && (evidence.seasonHints[0] || evidence.episodeHints[0])
    ? { episode: evidence.episodeHints[0] ?? null, season: evidence.seasonHints[0] ?? null }
    : null;
  const expectedMediaType = evidence?.mediaTypeHint === "movie"
    ? "movie"
    : evidence?.mediaTypeHint === "series"
      ? "tv"
      : inferExpectedMediaType(sourceText, contextualSeasonEpisode ?? sourceSeasonEpisode);

  return {
    actorSourceText: [
      context.youtubeTitle,
      context.youtubeDescription,
      ...(evidence?.characters ?? []),
      ...(evidence?.actors ?? []),
      ...(evidence?.dialogueFragments ?? []),
      ...(evidence?.sceneDescriptions ?? [])
    ].filter(Boolean).join(" "),
    expectedMediaType,
    sourceSeasonEpisode: contextualSeasonEpisode ?? sourceSeasonEpisode,
    sourceText,
    sourceYears: unique([
      ...(sourceText.match(YEAR_PATTERN) ?? []),
      ...(evidence?.yearHints.map(String) ?? [])
    ])
  };
}

function getSignalAvailability(
  candidates: TmdbCandidate[],
  context: CandidateScoringContext,
  analysis: ContextAnalysis
): SignalAvailability {
  const hasCandidateActorMetadata = candidates.some((candidate) => candidate.actorNames.length > 0);
  const hasChannelMetadata = candidates.some(
    (candidate) => candidate.networkNames.length > 0 || candidate.productionCompanyNames.length > 0
  );
  const hasKnownChannelSignal = Boolean(
    context.channelName &&
      (STREAMING_OR_TV_CHANNEL_PATTERN.test(context.channelName) || MOVIE_CHANNEL_PATTERN.test(context.channelName))
  );

  return {
    actorMatch: Boolean(analysis.actorSourceText.trim()) && hasCandidateActorMetadata,
    channelName: Boolean(context.channelName?.trim()) && (hasChannelMetadata || hasKnownChannelSignal),
    mediaType: Boolean(analysis.expectedMediaType),
    releaseYear: analysis.sourceYears.length > 0,
    seasonEpisode: Boolean(analysis.sourceSeasonEpisode),
    titleSimilarity: true
  };
}

function getActiveFactors(availability: SignalAvailability): Array<keyof CandidateScoreBreakdown> {
  return Object.entries(availability)
    .filter(([, isAvailable]) => isAvailable)
    .map(([factor]) => factor as keyof CandidateScoreBreakdown);
}

function combineScores(breakdown: CandidateScoreBreakdown, activeFactors: Array<keyof CandidateScoreBreakdown>): number {
  const totalWeight = activeFactors.reduce((sum, factor) => sum + SCORE_WEIGHTS[factor], 0);

  if (totalWeight === 0) {
    return 0;
  }

  const weightedScore = activeFactors.reduce((sum, factor) => sum + breakdown[factor] * SCORE_WEIGHTS[factor], 0);

  return roundScore(weightedScore / totalWeight);
}

function scoreMediaType(
  candidateMediaType: TmdbCandidateMediaType,
  expectedMediaType: TmdbCandidateMediaType | null
): number {
  if (!expectedMediaType) {
    return 0;
  }

  return candidateMediaType === expectedMediaType ? 1 : 0;
}

function scoreReleaseYear(candidateYear: string | null, sourceYears: string[]): number {
  if (sourceYears.length === 0) {
    return 0;
  }

  if (!candidateYear) {
    return 0.2;
  }

  const candidateYearNumber = Number(candidateYear);
  const bestDistance = Math.min(...sourceYears.map((sourceYear) => Math.abs(Number(sourceYear) - candidateYearNumber)));

  if (bestDistance === 0) {
    return 1;
  }

  if (bestDistance === 1) {
    return 0.75;
  }

  if (bestDistance <= 3) {
    return 0.35;
  }

  return 0;
}

function scoreActorMatch(matchedActorCount: number, candidateActorCount: number): number {
  if (candidateActorCount === 0 || matchedActorCount === 0) {
    return 0;
  }

  return roundScore(Math.min(1, matchedActorCount / Math.min(2, candidateActorCount)));
}

function scoreChannelName(
  candidate: TmdbCandidate,
  channelName: string | undefined,
  matchedChannelNames: string[]
): number {
  if (!channelName) {
    return 0;
  }

  if (matchedChannelNames.length > 0) {
    return 1;
  }

  if (STREAMING_OR_TV_CHANNEL_PATTERN.test(channelName)) {
    return candidate.mediaType === "tv" ? 0.65 : 0.5;
  }

  if (MOVIE_CHANNEL_PATTERN.test(channelName)) {
    return candidate.mediaType === "movie" ? 0.65 : 0.45;
  }

  return 0;
}

function scoreSeasonEpisode(candidate: TmdbCandidate, sourceSeasonEpisode: SeasonEpisodeNotation | null): number {
  if (!sourceSeasonEpisode) {
    return 0;
  }

  if (candidate.mediaType === "tv") {
    return 1;
  }

  const candidateText = `${candidate.title} ${candidate.originalTitle} ${candidate.overview}`;

  return parseSeasonEpisode(candidateText) ? 0.6 : 0;
}

function inferExpectedMediaType(
  sourceText: string,
  sourceSeasonEpisode: SeasonEpisodeNotation | null
): TmdbCandidateMediaType | null {
  if (sourceSeasonEpisode || TV_HINT_PATTERN.test(sourceText)) {
    return "tv";
  }

  if (MOVIE_HINT_PATTERN.test(sourceText)) {
    return "movie";
  }

  return null;
}

function parseSeasonEpisode(sourceText: string): SeasonEpisodeNotation | null {
  for (const pattern of SEASON_EPISODE_PATTERNS) {
    const match = sourceText.match(pattern);

    if (!match) {
      continue;
    }

    if (pattern === SEASON_EPISODE_PATTERNS[3]) {
      return {
        episode: Number(match[1]),
        season: null
      };
    }

    return {
      episode: match[2] ? Number(match[2]) : null,
      season: Number(match[1])
    };
  }

  return null;
}

function matchCandidateActors(actorNames: string[], description: string): string[] {
  const normalizedDescription = normalizeComparableText(description);

  if (!normalizedDescription) {
    return [];
  }

  return actorNames.filter((actorName) => normalizedDescription.includes(normalizeComparableText(actorName)));
}

function matchChannelNames(candidate: TmdbCandidate, channelName: string | undefined): string[] {
  if (!channelName) {
    return [];
  }

  const names = [...candidate.networkNames, ...candidate.productionCompanyNames];

  return names.filter((name) => comparableNameContains(channelName, name));
}

function comparableNameContains(left: string, right: string): boolean {
  const normalizedLeft = normalizeComparableText(left);
  const normalizedRight = normalizeComparableText(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

function normalizeComparableText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(MULTISPACE_PATTERN, " ")
    .trim();
}

function tokenJaccard(left: string, right: string): number {
  const leftTokens = new Set(left.split(WORD_SPLIT_PATTERN).filter(Boolean));
  const rightTokens = new Set(right.split(WORD_SPLIT_PATTERN).filter(Boolean));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union === 0 ? 0 : intersection / union;
}

function diceCoefficient(left: string, right: string): number {
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);

  if (leftBigrams.length === 0 || rightBigrams.length === 0) {
    return left === right ? 1 : 0;
  }

  const rightCounts = new Map<string, number>();

  for (const bigram of rightBigrams) {
    rightCounts.set(bigram, (rightCounts.get(bigram) ?? 0) + 1);
  }

  let intersection = 0;

  for (const bigram of leftBigrams) {
    const count = rightCounts.get(bigram) ?? 0;

    if (count > 0) {
      intersection += 1;
      rightCounts.set(bigram, count - 1);
    }
  }

  return (2 * intersection) / (leftBigrams.length + rightBigrams.length);
}

function bigrams(value: string): string[] {
  const compactValue = value.replace(WORD_SPLIT_PATTERN, "");

  if (compactValue.length < 2) {
    return compactValue ? [compactValue] : [];
  }

  return Array.from({ length: compactValue.length - 1 }, (_, index) => compactValue.slice(index, index + 2));
}

function compareScoredCandidates(first: ScoredTmdbCandidate, second: ScoredTmdbCandidate): number {
  return (
    second.confidence - first.confidence ||
    second.breakdown.titleSimilarity - first.breakdown.titleSimilarity ||
    second.candidate.popularity - first.candidate.popularity ||
    second.candidate.voteCount - first.candidate.voteCount
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
