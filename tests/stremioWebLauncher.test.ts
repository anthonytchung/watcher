import { afterEach, describe, expect, it, vi } from "vitest";

import { openStremioWebUrl } from "../src/content/stremioWebLauncher";
import { WATCHER_OPEN_STREMIO_WEB } from "../src/messages/tmdbMessages";

describe("Stremio Web tab launcher messaging", () => {
  const nativeProtocolUrl = ["stremio", ":///", "search?search=Adventure%20Time"].join("");

  afterEach(() => vi.unstubAllGlobals());

  it("sends a typed request for a valid Stremio Web URL", async () => {
    const url = "https://web.stremio.com/#/search?search=Adventure%20Time";
    const response = { ok: true as const, tabId: 42 };
    const sendMessage = vi.fn((request, callback) => callback(response));
    vi.stubGlobal("chrome", { runtime: { lastError: undefined, sendMessage } });

    await expect(openStremioWebUrl(url)).resolves.toEqual(response);
    expect(sendMessage).toHaveBeenCalledWith({ payload: { url }, type: WATCHER_OPEN_STREMIO_WEB }, expect.any(Function));
  });

  it("rejects native protocol URLs before messaging the background worker", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { lastError: undefined, sendMessage } });

    await expect(openStremioWebUrl(nativeProtocolUrl)).resolves.toEqual({
      error: expect.objectContaining({ code: "INVALID_STREMIO_WEB_URL" }),
      ok: false
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("returns a typed error when runtime messaging is unavailable", async () => {
    vi.stubGlobal("chrome", undefined);
    await expect(openStremioWebUrl("https://web.stremio.com/#/detail/movie/tt1877830")).resolves.toEqual({
      error: expect.objectContaining({ code: "CHROME_RUNTIME_UNAVAILABLE" }),
      ok: false
    });
  });
});
