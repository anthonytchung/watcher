import {
  WATCHER_TMDB_MULTI_SEARCH,
  type WatcherTmdbMultiSearchRequest,
  type WatcherTmdbMultiSearchRequestPayload,
  type WatcherTmdbMultiSearchResponse
} from "../messages/tmdbMessages";

export function requestTmdbCandidates(
  payload: WatcherTmdbMultiSearchRequestPayload
): Promise<WatcherTmdbMultiSearchResponse> {
  const request: WatcherTmdbMultiSearchRequest = {
    payload,
    type: WATCHER_TMDB_MULTI_SEARCH
  };

  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return Promise.resolve({
      error: {
        code: "CHROME_RUNTIME_UNAVAILABLE",
        message: "Chrome runtime messaging is unavailable."
      },
      ok: false
    });
  }

  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(request, (response: WatcherTmdbMultiSearchResponse | undefined) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          resolve({
            error: {
              code: "CHROME_RUNTIME_ERROR",
              message: runtimeError.message ?? "Chrome runtime messaging failed."
            },
            ok: false
          });
          return;
        }

        resolve(
          isRuntimeResponse(response) ? response : {
            error: {
              code: "TMDB_EMPTY_RESPONSE",
              message: "The background service worker did not return a TMDb search response."
            },
            ok: false
          }
        );
      });
    } catch (error) {
      resolve({
        error: {
          code: "CHROME_RUNTIME_ERROR",
          message: error instanceof Error ? error.message : "Chrome runtime messaging failed."
        },
        ok: false
      });
    }
  });
}

function isRuntimeResponse(response: unknown): response is WatcherTmdbMultiSearchResponse {
  if (!response || typeof response !== "object") return false;
  const value = response as Partial<WatcherTmdbMultiSearchResponse>;
  if (value.ok === false) return Boolean(value.error && typeof value.error.code === "string" && typeof value.error.message === "string");
  return value.ok === true && typeof value.query === "string" && Boolean(value.result && (value.result.kind === "best_match" || value.result.kind === "needs_selection"));
}
