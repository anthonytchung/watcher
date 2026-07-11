import {
  WATCHER_OPEN_STREMIO_WEB,
  type WatcherOpenStremioWebRequest,
  type WatcherOpenStremioWebResponse
} from "../messages/tmdbMessages";
import { isStremioWebUrl } from "../stremio/links";

export function openStremioWebUrl(url: string): Promise<WatcherOpenStremioWebResponse> {
  if (!isStremioWebUrl(url)) {
    return Promise.resolve({
      error: {
        code: "INVALID_STREMIO_WEB_URL",
        message: "A valid Stremio Web URL could not be created."
      },
      ok: false
    });
  }

  const request: WatcherOpenStremioWebRequest = {
    payload: { url },
    type: WATCHER_OPEN_STREMIO_WEB
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
      chrome.runtime.sendMessage(request, (response: WatcherOpenStremioWebResponse | undefined) => {
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

        resolve(isOpenResponse(response) ? response : {
          error: {
            code: "STREMIO_WEB_EMPTY_RESPONSE",
            message: "The background service worker did not return a Stremio Web tab response."
          },
          ok: false
        });
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

function isOpenResponse(response: unknown): response is WatcherOpenStremioWebResponse {
  if (!response || typeof response !== "object") return false;
  const value = response as Partial<WatcherOpenStremioWebResponse>;
  if (value.ok === true) return value.tabId === undefined || typeof value.tabId === "number";
  return value.ok === false && Boolean(value.error && typeof value.error.code === "string" && typeof value.error.message === "string");
}
