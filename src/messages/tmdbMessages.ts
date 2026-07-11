import type { ContextualMediaEvidence } from "../context/evidence";
import type { TmdbCandidateSelection } from "../tmdb/scoring";

export const WATCHER_TMDB_MULTI_SEARCH = "watcher.tmdb.multiSearch";
export const WATCHER_OPEN_STREMIO_WEB = "watcher.stremio.openWebTab";

export interface WatcherTmdbMultiSearchRequest {
  payload: WatcherTmdbMultiSearchRequestPayload;
  type: typeof WATCHER_TMDB_MULTI_SEARCH;
}

export interface WatcherTmdbMultiSearchRequestPayload {
  alternativeQueries?: string[];
  channelName?: string;
  cleanedTitle: string;
  confidenceThreshold?: number;
  contextualEvidence?: ContextualMediaEvidence;
  youtubeDescription?: string;
  youtubeTitle?: string;
  videoId: string;
  year?: number;
}

export interface WatcherTmdbMultiSearchSuccessResponse {
  result: TmdbCandidateSelection;
  ok: true;
  query: string;
}

export interface WatcherTmdbMultiSearchErrorResponse {
  error: WatcherRuntimeError;
  ok: false;
}

export interface WatcherRuntimeError {
  code: string;
  message: string;
  status?: number;
}

export type WatcherTmdbMultiSearchResponse =
  | WatcherTmdbMultiSearchSuccessResponse
  | WatcherTmdbMultiSearchErrorResponse;

export interface WatcherOpenStremioWebRequest {
  payload: WatcherOpenStremioWebRequestPayload;
  type: typeof WATCHER_OPEN_STREMIO_WEB;
}

export interface WatcherOpenStremioWebRequestPayload {
  url: string;
}

export interface WatcherOpenStremioWebSuccessResponse {
  ok: true;
  tabId?: number;
}

export type WatcherOpenStremioWebResponse =
  | WatcherOpenStremioWebSuccessResponse
  | WatcherTmdbMultiSearchErrorResponse;

export type WatcherRuntimeRequest = WatcherTmdbMultiSearchRequest | WatcherOpenStremioWebRequest;
export type WatcherRuntimeResponse = WatcherTmdbMultiSearchResponse | WatcherOpenStremioWebResponse;
