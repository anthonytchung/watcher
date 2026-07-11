const INVISIBLE_FORMATTING_PATTERN = /[\u200B-\u200D\uFEFF]/g;
const NOTIFICATION_COUNT_PATTERN = /^\s*\(\d+\)\s*/;
const YOUTUBE_SUFFIX_PATTERN = /\s*[-–—]\s*YouTube\s*$/i;
const MULTISPACE_PATTERN = /\s+/g;
const EDGE_SEPARATOR_PATTERN = /^[\s|:;,\-–—]+|[\s|:;,\-–—]+$/g;
const TITLE_SEGMENT_SEPARATOR_PATTERN = /\s+(?:[|｜•·]|[-–—])\s+/g;
const EMPTY_BRACKET_PATTERN = /\s*(?:\[|\()\s*(?:\]|\))\s*/g;
import type { NormalizedMediaQuery } from "./types";

const BRACKETED_NOISE_PATTERN =
  /\s*(?:\[|\()\s*(?:(?:official|teaser|final|main|full|extended|red\s*band|new)\s+)?(?:trailer|movie\s+clip|clip|full\s+scene|opening\s+scene|ending\s+scene|deleted\s+scene|reaction|explained|review|breakdown|analysis|interview|behind\s+the\s+scenes|featurette|soundtrack|compilation|fan\s+edit|edit|4k|8k|hd|hdr|uhd|remastered|subtitles?|dubbed|1080p|720p)(?:\s*#?\d+)?\s*(?:\]|\))\s*/gi;
const QUALITY_TERM_PATTERN = /\b(?:4k|8k|uhd|hdr|full\s+hd|hd|1080p|720p|remastered|subtitles?|dubbed)\b/gi;
const TRAILER_TERM_PATTERN =
  /\b(?:(?:official|teaser|final|main|full|extended|red\s*band|new|first)\s+)?(?:teaser\s+)?trailer(?:\s*#?\d+|\s+\d+)?\b/gi;
const NOISE_PHRASE_PATTERN =
  /\b(?:(?:movie|film|tv)\s+(?:review|reaction)|movie\s+clip(?:\s*#?\d+|\s+\d+)?|(?:full|opening|ending|deleted)\s+scene|best\s+moments|ending\s+explained|finale\s+explained|behind\s+the\s+scenes|fan\s+edit|tr[aá]iler\s+oficial|bande[- ]annonce\s+officielle|reaction|explained|review|breakdown|analysis|interview|featurette|soundtrack|compilation|edit)\b/gi;
const CLIP_LABEL_PATTERN = /\bclip(?:\s*#?\d+|\s+\d+)?\b/gi;
const HANGING_PUNCTUATION_PATTERN = /\s*([:;,|])\s*(?=$|\)|\])/g;
const REPEATED_SEPARATOR_PATTERN = /\s*[-–—|｜•·]{2,}\s*/g;
const SEASON_OR_EPISODE_PATTERN =
  /\b(?:s(?:eason)?\s*\d{1,2}(?:\s*[,/:-]?\s*e(?:p(?:isode)?)?\s*\d{1,3})?|s\d{1,2}\s*e\d{1,3}|\d{1,2}x\d{1,3}|e(?:p(?:isode)?)?\s*\d{1,3})\b/i;
const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/;
const QUALIFIER_PATTERN = new RegExp(
  `${TRAILER_TERM_PATTERN.source}|${NOISE_PHRASE_PATTERN.source}|${QUALITY_TERM_PATTERN.source}|${CLIP_LABEL_PATTERN.source}`,
  "gi"
);

export function cleanTitle(rawTitle: string): string {
  const withoutInvisibleChars = rawTitle.replace(INVISIBLE_FORMATTING_PATTERN, "");
  const withoutNotificationCount = stripNotificationCount(withoutInvisibleChars);
  const withoutYouTubeSuffix = stripYouTubeSuffix(withoutNotificationCount);
  const normalized = normalizeTitleWhitespace(withoutYouTubeSuffix);

  return stripDecorativeEdges(normalized);
}

export function stripNotificationCount(title: string): string {
  return title.replace(NOTIFICATION_COUNT_PATTERN, "");
}

export function stripYouTubeSuffix(title: string): string {
  return title.replace(YOUTUBE_SUFFIX_PATTERN, "");
}

export function normalizeTitleWhitespace(title: string): string {
  return title.replace(MULTISPACE_PATTERN, " ").trim();
}

export function stripDecorativeEdges(title: string): string {
  return title.replace(EDGE_SEPARATOR_PATTERN, "").trim();
}

export function toProbableMediaTitle(rawTitle: string): string {
  const title = cleanTitle(rawTitle);

  if (!title) {
    return "";
  }

  const segments = title.split(TITLE_SEGMENT_SEPARATOR_PATTERN);
  const probableSegments: string[] = [];

  for (const segment of segments) {
    const cleanedSegment = cleanMediaTitleSegment(segment);

    if (!cleanedSegment) {
      continue;
    }

    if (probableSegments.length === 0 || shouldKeepSupplementalSegment(cleanedSegment)) {
      probableSegments.push(cleanedSegment);
    }
  }

  return finalizeProbableTitle(probableSegments.join(" "));
}

export function normalizeMediaQuery(rawTitle: string): NormalizedMediaQuery {
  const cleanedTitle = cleanTitle(rawTitle);
  const probableTitle = toProbableMediaTitle(cleanedTitle);
  const seasonEpisode = extractSeasonEpisode(cleanedTitle);
  const yearMatch = cleanedTitle.match(YEAR_PATTERN);
  const removedQualifiers = uniqueMatches(cleanedTitle, QUALIFIER_PATTERN);
  const alternativeQueries = [
    finalizeProbableTitle(probableTitle.replace(YEAR_PATTERN, "")),
    finalizeProbableTitle(probableTitle.replace(SEASON_OR_EPISODE_PATTERN, ""))
  ].filter((query, index, values) => query && query !== probableTitle && values.indexOf(query) === index);

  return {
    alternativeQueries,
    episode: seasonEpisode?.episode,
    mediaTypeHint: seasonEpisode ? "series" : /\b(?:season|episode|series|show|finale|pilot)\b/i.test(cleanedTitle) ? "series" : /\b(?:movie|film)\b/i.test(cleanedTitle) ? "movie" : undefined,
    probableTitle,
    rawTitle: cleanedTitle,
    removedQualifiers,
    season: seasonEpisode?.season,
    year: yearMatch ? Number(yearMatch[0]) : undefined
  };
}

function extractSeasonEpisode(title: string): { episode?: number; season?: number } | null {
  const compact = title.match(/\bs(?:eason)?\s*(\d{1,2})\s*[,/:-]?\s*e(?:p(?:isode)?)?\s*(\d{1,3})\b/i)
    ?? title.match(/\bs(\d{1,2})e(\d{1,3})\b/i)
    ?? title.match(/\b(\d{1,2})x(\d{1,3})\b/i);

  if (compact) {
    return { episode: Number(compact[2]), season: Number(compact[1]) };
  }

  const season = title.match(/\bseason\s*(\d{1,2})\b/i);
  const episode = title.match(/\b(?:episode|ep)\s*(\d{1,3})\b/i);
  return season || episode
    ? { episode: episode ? Number(episode[1]) : undefined, season: season ? Number(season[1]) : undefined }
    : null;
}

function uniqueMatches(value: string, pattern: RegExp): string[] {
  pattern.lastIndex = 0;
  return [...new Set(Array.from(value.matchAll(pattern), (match) => match[0].trim().toLowerCase()).filter(Boolean))];
}

function cleanMediaTitleSegment(segment: string): string {
  const withoutBracketedNoise = segment.replace(BRACKETED_NOISE_PATTERN, " ");
  const withoutTrailerTerms = withoutBracketedNoise.replace(TRAILER_TERM_PATTERN, " ");
  const withoutNoisePhrases = withoutTrailerTerms.replace(NOISE_PHRASE_PATTERN, " ");
  const withoutClipLabels = withoutNoisePhrases.replace(CLIP_LABEL_PATTERN, " ");
  const withoutQualityTerms = withoutClipLabels.replace(QUALITY_TERM_PATTERN, " ");

  return finalizeProbableTitle(withoutQualityTerms);
}

function shouldKeepSupplementalSegment(segment: string): boolean {
  return SEASON_OR_EPISODE_PATTERN.test(segment) || YEAR_PATTERN.test(segment);
}

function finalizeProbableTitle(title: string): string {
  const withoutEmptyBrackets = title.replace(EMPTY_BRACKET_PATTERN, " ");
  const withoutHangingPunctuation = withoutEmptyBrackets.replace(HANGING_PUNCTUATION_PATTERN, " ");
  const withoutRepeatedSeparators = withoutHangingPunctuation.replace(REPEATED_SEPARATOR_PATTERN, " ");
  const normalized = normalizeTitleWhitespace(withoutRepeatedSeparators);

  return stripDecorativeEdges(normalized);
}
