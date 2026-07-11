import type { YouTubeVideoInfo } from "../youtube/types";

export type ContextualMediaTypeHint = "movie" | "series" | "unknown";

export interface ContextualMediaEvidence {
  actors: string[];
  channelName?: string;
  chapters: string[];
  characters: string[];
  cleanedTitle: string;
  description?: string;
  dialogueFragments: string[];
  episodeHints: number[];
  franchiseHints: string[];
  hashtags: string[];
  mediaTypeHint: ContextualMediaTypeHint;
  probableTitles: string[];
  publicationDate?: string;
  rawTitle: string;
  sceneDescriptions: string[];
  seasonHints: number[];
  structuredMetadata: Record<string, string>;
  transcriptExcerpts: string[];
  videoUrl: string;
  yearHints: number[];
  youtubeVideoId: string;
}

export interface ContextualCandidate {
  evidence: string[];
  imdbId?: string;
  mediaType: "movie" | "series";
  seasonNumber?: number;
  episodeNumber?: number;
  title: string;
  tmdbId?: number;
}

export interface ContextualMatch {
  alternatives: ContextualCandidate[];
  confidence: "high" | "medium" | "low";
  episodeNumber?: number;
  episodeTitle?: string;
  evidence: string[];
  imdbId?: string;
  matchLevel:
    | "exact_movie"
    | "exact_series"
    | "likely_episode"
    | "exact_episode"
    | "ambiguous_media"
    | "ambiguous_episode"
    | "no_reliable_match";
  mediaTitle?: string;
  seasonNumber?: number;
  seriesTitle?: string;
  tmdbId?: number;
}

const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/g;
const HASHTAG_PATTERN = /#[\p{L}\p{N}_]+/gu;
const CHAPTER_PATTERN = /^\s*(?:(?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.{2,120})$/gm;
const QUOTED_TEXT_PATTERN = /["“”']([^"“”']{4,160})["“”']/g;
const CAPITALIZED_NAME_PATTERN = /\b(?:[A-Z][a-z]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]+|[A-Z]{2,})){0,2}\b/g;
const TITLE_PREFIX_SEPARATOR_PATTERN = /\s*[:|]\s*/;
const TITLE_SEGMENT_SEPARATOR_PATTERN = /\s*[|｜•·]\s*/;
const SCENE_VERB_PATTERN = /\b(?:leaves?|meets?|fights?|dies?|saves?|finds?|remembers?|explains?|returns?|betrays?|kills?|rescues?|confronts?|loses?|wins?|talks?|says?|tells?|discovers?)\b/i;
const SCENE_VERB_WORD_PATTERN = /^(?:leaves?|meets?|fights?|dies?|saves?|finds?|remembers?|explains?|returns?|betrays?|kills?|rescues?|confronts?|loses?|wins?|talks?|says?|tells?|discovers?)$/i;
const ACTOR_INTRO_PATTERN = /\b(?:starring|stars|featuring|cast|with)\s+([^.\n#]{3,180})/gi;
const STOP_NAME_PATTERN =
  /^(?:official|trailer|teaser|movie|film|clip|scene|episode|season|review|reaction|explained|breakdown|analysis|hd|uhd|hdr|youtube|stremio|tmdb|part|full|best|new|final)$/i;
const NON_TITLE_SEGMENT_PATTERN =
  /^(?:official|trailer|teaser|movie|film|clip|scene|episode|season|review|reaction|explained|breakdown|analysis|hd|uhd|hdr|youtube|stremio|tmdb|part|full|best|new|final|cartoon\s+network|warner\s+bros\.?|disney\+?|netflix|hulu|prime\s+video|paramount\+?|universal\s+pictures?|sony\s+pictures?)$/i;

export function collectContextualMediaEvidence(video: YouTubeVideoInfo): ContextualMediaEvidence {
  const textCorpus = [video.rawTitle, video.title, video.description, video.channelName].filter(Boolean).join("\n");
  const titleParts = splitTitlePrefix(video.title);
  const probableTitles = buildProbableTitles(video, titleParts.prefix);
  const sceneDescriptions = buildSceneDescriptions(titleParts.suffix);
  const seasonEpisodeHints = collectSeasonEpisodeHints(textCorpus, video);
  const yearHints = uniqueNumbers([
    ...extractYears(textCorpus),
    ...(video.normalizedQuery.year ? [video.normalizedQuery.year] : [])
  ]);
  const characters = extractCharacterNames([titleParts.suffix, video.description], probableTitles);

  return {
    actors: extractActorNames(video.description),
    channelName: video.channelName || undefined,
    chapters: extractChapters(video.description),
    characters,
    cleanedTitle: video.probableMediaTitle,
    description: video.description || undefined,
    dialogueFragments: extractQuotedText(textCorpus),
    episodeHints: seasonEpisodeHints.episodes,
    franchiseHints: probableTitles.slice(1),
    hashtags: extractHashtags(textCorpus),
    mediaTypeHint: inferContextualMediaType(video, sceneDescriptions, characters),
    probableTitles,
    publicationDate: video.publishedAt,
    rawTitle: video.rawTitle,
    sceneDescriptions,
    seasonHints: seasonEpisodeHints.seasons,
    structuredMetadata: {
      canonicalUrl: video.url
    },
    transcriptExcerpts: [],
    videoUrl: video.url,
    yearHints,
    youtubeVideoId: video.videoId
  };
}

export function selectContextualSearchTitle(evidence: ContextualMediaEvidence): string {
  return evidence.probableTitles[0] ?? evidence.cleanedTitle;
}

function buildProbableTitles(video: YouTubeVideoInfo, titlePrefix: string | null): string[] {
  const titleSegments = extractTitleSegments(video.title);
  const usefulSegments = titleSegments.filter(isUsefulTitleSegment);
  const channelDerivedTitles = buildChannelDerivedTitles(video.channelName, usefulSegments);
  return uniqueStrings([
    ...channelDerivedTitles,
    ...usefulSegments,
    titlePrefix,
    video.normalizedQuery.probableTitle,
    video.probableMediaTitle,
    ...video.normalizedQuery.alternativeQueries
  ].filter((value): value is string => Boolean(value?.trim())).map(normalizeTitleLike));
}

function extractTitleSegments(title: string): string[] {
  if (!TITLE_SEGMENT_SEPARATOR_PATTERN.test(title)) return [];
  return title
    .split(TITLE_SEGMENT_SEPARATOR_PATTERN)
    .map(normalizeTitleLike)
    .filter(Boolean);
}

function isUsefulTitleSegment(segment: string): boolean {
  const normalized = normalizeComparable(segment);
  if (!normalized || NON_TITLE_SEGMENT_PATTERN.test(segment)) return false;
  const tokens = normalized.split(" ");
  if (tokens.length > 8) return false;
  return tokens.some((token) => !STOP_NAME_PATTERN.test(token));
}

function buildChannelDerivedTitles(channelName: string, titleSegments: string[]): string[] {
  const normalizedChannel = normalizeComparable(channelName);
  if (!normalizedChannel) return [];

  return titleSegments
    .filter((segment) => {
      const normalizedSegment = normalizeComparable(segment);
      if (!normalizedSegment || normalizedSegment.length < 4) return false;
      return normalizedChannel.includes(normalizedSegment) && normalizedChannel !== normalizedSegment;
    })
    .map(() => normalizeTitleLike(channelName));
}

function splitTitlePrefix(title: string): { prefix: string | null; suffix: string | null } {
  const parts = title.split(TITLE_PREFIX_SEPARATOR_PATTERN).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return { prefix: null, suffix: null };
  const [prefix, ...suffixParts] = parts;
  const suffix = suffixParts.join(": ");
  return prefix.length >= 2 && suffix.length >= 4 ? { prefix, suffix } : { prefix: null, suffix: null };
}

function buildSceneDescriptions(titleSuffix: string | null): string[] {
  if (!titleSuffix || !SCENE_VERB_PATTERN.test(titleSuffix)) return [];
  return [normalizeTitleLike(titleSuffix)];
}

function inferContextualMediaType(
  video: YouTubeVideoInfo,
  sceneDescriptions: string[],
  characters: string[]
): ContextualMediaTypeHint {
  if (video.normalizedQuery.mediaTypeHint === "movie") return "movie";
  if (video.normalizedQuery.mediaTypeHint === "series") return "series";
  if (video.normalizedQuery.season || video.normalizedQuery.episode) return "series";
  if (/\b(?:season|episode|series|show|s\d{1,2}e\d{1,3}|\d{1,2}x\d{1,3})\b/i.test(`${video.title} ${video.description}`)) {
    return "series";
  }
  if (sceneDescriptions.length > 0 && characters.length > 0) return "series";
  if (/\b(?:movie|film)\b/i.test(`${video.title} ${video.description}`)) return "movie";
  return "unknown";
}

function extractHashtags(text: string): string[] {
  return uniqueStrings([...text.matchAll(HASHTAG_PATTERN)].map((match) => match[0]));
}

function extractChapters(description: string): string[] {
  return uniqueStrings([...description.matchAll(CHAPTER_PATTERN)].map((match) => normalizeTitleLike(match[1])).filter(Boolean));
}

function extractQuotedText(text: string): string[] {
  return uniqueStrings([...text.matchAll(QUOTED_TEXT_PATTERN)].map((match) => normalizeTitleLike(match[1])).filter(Boolean)).slice(0, 8);
}

function extractYears(text: string): number[] {
  return [...text.matchAll(YEAR_PATTERN)].map((match) => Number(match[0]));
}

function collectSeasonEpisodeHints(
  text: string,
  video: YouTubeVideoInfo
): { episodes: number[]; seasons: number[] } {
  const seasons: number[] = [];
  const episodes: number[] = [];
  if (video.normalizedQuery.season) seasons.push(video.normalizedQuery.season);
  if (video.normalizedQuery.episode) episodes.push(video.normalizedQuery.episode);

  const patterns = [
    /\bs(?:eason)?\s*(\d{1,2})\s*[,/:-]?\s*e(?:p(?:isode)?)?\s*(\d{1,3})\b/gi,
    /\bs(\d{1,2})\s*e(\d{1,3})\b/gi,
    /\b(\d{1,2})x(\d{1,3})\b/gi,
    /\bseason\s*(\d{1,2})\b/gi,
    /\b(?:episode|ep)\s*(\d{1,3})\b/gi
  ];

  for (const pattern of patterns.slice(0, 3)) {
    for (const match of text.matchAll(pattern)) {
      seasons.push(Number(match[1]));
      episodes.push(Number(match[2]));
    }
  }
  for (const match of text.matchAll(patterns[3])) seasons.push(Number(match[1]));
  for (const match of text.matchAll(patterns[4])) episodes.push(Number(match[1]));

  return {
    episodes: uniqueNumbers(episodes),
    seasons: uniqueNumbers(seasons)
  };
}

function extractCharacterNames(textParts: Array<string | undefined | null>, probableTitles: string[]): string[] {
  const titleTokens = new Set(probableTitles.slice(0, 1).flatMap((title) => normalizeComparable(title).split(" ")));
  const names = textParts
    .filter(Boolean)
    .flatMap((text) => [...String(text).matchAll(CAPITALIZED_NAME_PATTERN)].map((match) => cleanNameCandidate(match[0].trim())))
    .filter((name) => isUsefulName(name, titleTokens));

  return uniqueStrings(names).slice(0, 12);
}

function cleanNameCandidate(name: string): string {
  const tokens = name.split(/\s+/);
  while (tokens.length > 1 && SCENE_VERB_WORD_PATTERN.test(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ");
}

function extractActorNames(description: string): string[] {
  const actors: string[] = [];
  for (const match of description.matchAll(ACTOR_INTRO_PATTERN)) {
    actors.push(...match[1].split(/\s*,\s*|\s+and\s+/i).map(normalizeTitleLike));
  }
  return uniqueStrings(actors.filter((name) => isUsefulName(name, new Set()))).slice(0, 12);
}

function isUsefulName(name: string, titleTokens: Set<string>): boolean {
  const normalized = normalizeComparable(name);
  if (!normalized || STOP_NAME_PATTERN.test(name)) return false;
  if (normalized.length < 3) return false;
  const tokens = normalized.split(" ");
  if (tokens.every((token) => titleTokens.has(token))) return false;
  return tokens.every((token) => !STOP_NAME_PATTERN.test(token));
}

function normalizeTitleLike(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^[\s:|,.-]+|[\s:|,.-]+$/g, "").trim();
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}
