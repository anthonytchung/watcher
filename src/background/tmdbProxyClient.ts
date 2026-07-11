import { tmdbMultiSearchToCandidates } from "../tmdb/candidates";
import type { TmdbApiErrorResponse, TmdbCandidateSearchResponse, TmdbMultiSearchResponse } from "../tmdb/types";

const CANDIDATE_LIMIT = 5;
const DEFAULT_LANGUAGE = "en-US";
const DEFAULT_PROXY_URL = import.meta.env.VITE_TMDB_MULTI_SEARCH_PROXY_URL?.trim() ?? "";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_QUERY_LENGTH = 160;
const CACHE_LIMIT = 50;
const responseCache = new Map<string, TmdbCandidateSearchResponse>();

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface SearchTmdbCandidatesOptions {
  fetcher?: Fetcher;
  language?: string;
  proxyUrl?: string;
  timeoutMs?: number;
}

export class TmdbProxySearchError extends Error {
  code: string;
  status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "TmdbProxySearchError";
    this.code = code;
    this.status = status;
  }
}

export async function searchTmdbCandidates(
  cleanedTitle: string,
  options: SearchTmdbCandidatesOptions = {}
): Promise<TmdbCandidateSearchResponse> {
  const query = cleanedTitle.trim();

  if (!query) {
    return {
      candidates: [],
      query,
      source: "tmdb"
    };
  }

  if (query.length > MAX_QUERY_LENGTH) {
    throw new TmdbProxySearchError("TMDB_QUERY_TOO_LONG", `TMDb queries must be ${MAX_QUERY_LENGTH} characters or fewer.`);
  }

  const proxyUrl = options.proxyUrl ?? DEFAULT_PROXY_URL;

  if (!proxyUrl) {
    throw new TmdbProxySearchError(
      "TMDB_PROXY_NOT_CONFIGURED",
      "TMDb search requires VITE_TMDB_MULTI_SEARCH_PROXY_URL to point at a server-side proxy."
    );
  }

  const cacheKey = buildCacheKey(proxyUrl, query, options.language ?? DEFAULT_LANGUAGE);
  const cached = responseCache.get(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response;

  try {
    response = await (options.fetcher ?? fetch)(buildProxyUrl(proxyUrl, query, options.language ?? DEFAULT_LANGUAGE), {
      headers: { Accept: "application/json" },
      method: "GET",
      signal: controller.signal
    });
  } catch {
    if (controller.signal.aborted) {
      throw new TmdbProxySearchError("TMDB_PROXY_TIMEOUT", "TMDb search timed out. Please try again.");
    }
    throw new TmdbProxySearchError("TMDB_PROXY_UNAVAILABLE", "TMDb search is temporarily unavailable.");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw await toSearchError(response);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new TmdbProxySearchError("TMDB_PROXY_INVALID_RESPONSE", "TMDb proxy returned invalid JSON.");
  }

  if (!isTmdbMultiSearchResponse(payload)) {
    throw new TmdbProxySearchError("TMDB_PROXY_INVALID_RESPONSE", "TMDb proxy returned an invalid response shape.");
  }

  const result: TmdbCandidateSearchResponse = {
    candidates: tmdbMultiSearchToCandidates(payload, CANDIDATE_LIMIT),
    query,
    source: "tmdb"
  };
  responseCache.set(cacheKey, result);
  if (responseCache.size > CACHE_LIMIT) responseCache.delete(responseCache.keys().next().value ?? "");
  return result;
}

export function buildCacheKey(proxyUrl: string, query: string, language: string): string {
  return `${proxyUrl.trim()}\u0000${language.trim().toLocaleLowerCase()}\u0000${query.trim().toLocaleLowerCase()}`;
}

function buildProxyUrl(proxyUrl: string, query: string, language: string): URL {
  let url: URL;

  try {
    url = new URL(proxyUrl);
  } catch {
    throw new TmdbProxySearchError("TMDB_PROXY_URL_INVALID", "TMDb proxy URL is not a valid absolute URL.");
  }

  const isLocalHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new TmdbProxySearchError("TMDB_PROXY_URL_INVALID", "TMDb proxy URL must use HTTPS (or localhost HTTP)." );
  }

  url.searchParams.set("query", query);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", language);

  return url;
}

function isTmdbMultiSearchResponse(payload: unknown): payload is TmdbMultiSearchResponse {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Partial<TmdbMultiSearchResponse>;
  return typeof value.page === "number" && Array.isArray(value.results);
}

async function toSearchError(response: Response): Promise<TmdbProxySearchError> {
  const fallbackMessage = `TMDb proxy request failed with HTTP ${response.status}.`;
  const body = await readErrorBody(response);

  return new TmdbProxySearchError(
    "TMDB_PROXY_REQUEST_FAILED",
    body?.status_message ?? body?.message ?? fallbackMessage,
    response.status
  );
}

async function readErrorBody(response: Response): Promise<(Partial<TmdbApiErrorResponse> & { message?: string }) | null> {
  try {
    return (await response.json()) as Partial<TmdbApiErrorResponse> & { message?: string };
  } catch {
    return null;
  }
}
