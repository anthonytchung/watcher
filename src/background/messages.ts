import {
  WATCHER_OPEN_STREMIO_WEB,
  WATCHER_TMDB_MULTI_SEARCH,
  type WatcherOpenStremioWebRequest,
  type WatcherOpenStremioWebResponse,
  type WatcherRuntimeResponse,
  type WatcherTmdbMultiSearchRequest,
  type WatcherTmdbMultiSearchResponse
} from "../messages/tmdbMessages";
import { selectContextualSearchTitle, type ContextualMediaEvidence } from "../context/evidence";
import { isStremioWebUrl } from "../stremio/links";
import { DEFAULT_CONFIDENCE_THRESHOLD, selectTmdbCandidate } from "../tmdb/scoring";
import { searchTmdbCandidates, TmdbProxySearchError } from "./tmdbProxyClient";

const DEFAULT_THRESHOLD = parseConfidenceThreshold(
  import.meta.env.VITE_TMDB_CONFIDENCE_THRESHOLD,
  DEFAULT_CONFIDENCE_THRESHOLD
);

const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_TITLE_LENGTH = 200;
const MAX_CONTEXT_LIST_LENGTH = 12;

type OpenTab = (url: string) => Promise<number | undefined>;
type SearchCandidates = typeof searchTmdbCandidates;

export function handleRuntimeMessage(
  message: unknown,
  senderUrl?: string,
  openTab: OpenTab = openStremioWebTab,
  searchCandidates: SearchCandidates = searchTmdbCandidates
): Promise<WatcherRuntimeResponse> | undefined {
  if (!isAllowedSender(senderUrl)) {
    return undefined;
  }

  if (isTmdbMultiSearchRequest(message)) {
    return handleTmdbMultiSearchRequest(message, searchCandidates);
  }

  if (isOpenStremioWebRequest(message)) {
    return handleOpenStremioWebRequest(message, openTab);
  }

  return undefined;
}

async function handleTmdbMultiSearchRequest(
  request: WatcherTmdbMultiSearchRequest,
  searchCandidates: SearchCandidates
): Promise<WatcherTmdbMultiSearchResponse> {
  try {
    const queries = buildTmdbSearchQueries(request);
    let result = await searchCandidates(queries[0]);
    for (const query of queries.slice(1)) {
      if (result.candidates.length > 0) break;
      result = await searchCandidates(query);
    }
    const selection = selectTmdbCandidate(
      result.candidates,
      {
        alternativeQueries: request.payload.alternativeQueries,
        channelName: request.payload.channelName,
        cleanedTitle: request.payload.cleanedTitle,
        contextualEvidence: request.payload.contextualEvidence,
        youtubeDescription: request.payload.youtubeDescription,
        youtubeTitle: request.payload.youtubeTitle
      },
      {
        confidenceThreshold: request.payload.confidenceThreshold ?? DEFAULT_THRESHOLD
      }
    );

    return {
      result: selection,
      ok: true,
      query: result.query
    };
  } catch (error) {
    if (error instanceof TmdbProxySearchError) {
      return {
        error: {
          code: error.code,
          message: error.message,
          status: error.status
        },
        ok: false
      };
    }

    return {
      error: {
        code: "TMDB_SEARCH_FAILED",
        message: error instanceof Error ? error.message : "TMDb search failed."
      },
      ok: false
    };
  }
}

function buildTmdbSearchQueries(request: WatcherTmdbMultiSearchRequest): string[] {
  const contextualEvidence = request.payload.contextualEvidence;
  const contextualTitle = contextualEvidence ? selectContextualSearchTitle(contextualEvidence) : undefined;
  return uniqueStrings([
    contextualTitle,
    request.payload.cleanedTitle,
    ...(contextualEvidence?.probableTitles ?? []),
    ...(request.payload.alternativeQueries ?? [])
  ].filter((query): query is string => Boolean(query?.trim())).map((query) => query.trim().slice(0, MAX_TITLE_LENGTH)));
}

async function handleOpenStremioWebRequest(
  request: WatcherOpenStremioWebRequest,
  openTab: OpenTab
): Promise<WatcherOpenStremioWebResponse> {
  try {
    return {
      ok: true,
      tabId: await openTab(request.payload.url)
    };
  } catch (error) {
    return {
      error: {
        code: "STREMIO_WEB_TAB_OPEN_FAILED",
        message: error instanceof Error ? error.message : "Could not open Stremio Web."
      },
      ok: false
    };
  }
}

export function isTmdbMultiSearchRequest(message: unknown): message is WatcherTmdbMultiSearchRequest {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Partial<WatcherTmdbMultiSearchRequest>;
  if (typeof candidate.payload !== "object" || candidate.payload === null) return false;
  const payload = candidate.payload as Partial<WatcherTmdbMultiSearchRequest["payload"]>;
  return (
    candidate.type === WATCHER_TMDB_MULTI_SEARCH &&
    typeof payload.cleanedTitle === "string" &&
    payload.cleanedTitle.trim().length > 0 && payload.cleanedTitle.length <= MAX_TITLE_LENGTH &&
    typeof payload.videoId === "string" && /^[A-Za-z0-9_-]{6,20}$/.test(payload.videoId) &&
    optionalShortString(payload.youtubeTitle, MAX_TITLE_LENGTH) &&
    optionalShortString(payload.channelName, MAX_TITLE_LENGTH) &&
    optionalShortString(payload.youtubeDescription, MAX_DESCRIPTION_LENGTH) &&
    (payload.contextualEvidence === undefined || isContextualMediaEvidence(payload.contextualEvidence)) &&
    (payload.alternativeQueries === undefined || (Array.isArray(payload.alternativeQueries) && payload.alternativeQueries.length <= 3 && payload.alternativeQueries.every((query) => typeof query === "string" && query.length <= MAX_TITLE_LENGTH))) &&
    (payload.confidenceThreshold === undefined || (Number.isFinite(payload.confidenceThreshold) && payload.confidenceThreshold >= 0 && payload.confidenceThreshold <= 1))
  );
}

function isContextualMediaEvidence(value: unknown): value is ContextualMediaEvidence {
  if (!value || typeof value !== "object") return false;
  const evidence = value as Partial<ContextualMediaEvidence>;
  return (
    typeof evidence.youtubeVideoId === "string" &&
    /^[A-Za-z0-9_-]{6,20}$/.test(evidence.youtubeVideoId) &&
    optionalShortString(evidence.rawTitle, MAX_TITLE_LENGTH) &&
    optionalShortString(evidence.cleanedTitle, MAX_TITLE_LENGTH) &&
    optionalShortString(evidence.description, MAX_DESCRIPTION_LENGTH) &&
    optionalShortString(evidence.channelName, MAX_TITLE_LENGTH) &&
    optionalShortString(evidence.publicationDate, MAX_TITLE_LENGTH) &&
    optionalShortString(evidence.videoUrl, MAX_TITLE_LENGTH * 3) &&
    isStringList(evidence.chapters, 20, 160) &&
    isStringList(evidence.transcriptExcerpts, 3, 500) &&
    isStringList(evidence.probableTitles, 5, MAX_TITLE_LENGTH) &&
    isStringList(evidence.characters, MAX_CONTEXT_LIST_LENGTH, 120) &&
    isStringList(evidence.actors, MAX_CONTEXT_LIST_LENGTH, 120) &&
    isStringList(evidence.dialogueFragments, 8, 180) &&
    isStringList(evidence.sceneDescriptions, 6, 180) &&
    isStringList(evidence.franchiseHints, 6, MAX_TITLE_LENGTH) &&
    isStringList(evidence.hashtags, 20, 80) &&
    isPositiveIntegerList(evidence.yearHints, 8) &&
    isPositiveIntegerList(evidence.seasonHints, 8) &&
    isPositiveIntegerList(evidence.episodeHints, 8) &&
    (evidence.mediaTypeHint === "movie" || evidence.mediaTypeHint === "series" || evidence.mediaTypeHint === "unknown")
  );
}

function isStringList(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => typeof item === "string" && item.length <= maxLength);
}

function isPositiveIntegerList(value: unknown, maxItems: number): value is number[] {
  return Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => Number.isInteger(item) && item > 0);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function isOpenStremioWebRequest(message: unknown): message is WatcherOpenStremioWebRequest {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<WatcherOpenStremioWebRequest>;
  if (candidate.type !== WATCHER_OPEN_STREMIO_WEB || typeof candidate.payload !== "object" || candidate.payload === null) {
    return false;
  }
  const payload = candidate.payload as Partial<WatcherOpenStremioWebRequest["payload"]>;
  return typeof payload.url === "string" && isStremioWebUrl(payload.url);
}

function optionalShortString(value: unknown, maxLength: number): boolean {
  return value === undefined || (typeof value === "string" && value.length <= maxLength);
}

async function openStremioWebTab(url: string): Promise<number | undefined> {
  if (typeof chrome === "undefined" || !chrome.tabs?.create) {
    throw new Error("Chrome tab creation is unavailable.");
  }

  const tab = await chrome.tabs.create({ active: true, url });
  return tab.id;
}

function isAllowedSender(senderUrl: string | undefined): boolean {
  if (!senderUrl) return true;
  try {
    const url = new URL(senderUrl);
    return (url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com")) && url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseConfidenceThreshold(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const threshold = Number(value);

  return Number.isFinite(threshold) && threshold >= 0 && threshold <= 1 ? threshold : fallback;
}
