import { afterEach, describe, expect, it, vi } from "vitest";

import { WATCHER_TMDB_MULTI_SEARCH } from "../src/messages/tmdbMessages";
import { requestTmdbCandidates } from "../src/content/tmdbSearchClient";

const payload = { cleanedTitle: "Dune", videoId: "n9xhJrPXop4" };

describe("content to service-worker messaging", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the typed request and returns a valid response", async () => {
    const response = { ok: true as const, query: "Dune", result: { candidates: [], confidenceThreshold: 0.74, kind: "needs_selection" as const } };
    const sendMessage = vi.fn((request, callback) => callback(response));
    vi.stubGlobal("chrome", { runtime: { lastError: undefined, sendMessage } });
    await expect(requestTmdbCandidates(payload)).resolves.toEqual(response);
    expect(sendMessage).toHaveBeenCalledWith({ payload, type: WATCHER_TMDB_MULTI_SEARCH }, expect.any(Function));
  });

  it("normalizes malformed background responses", async () => {
    vi.stubGlobal("chrome", { runtime: { lastError: undefined, sendMessage: (_request: unknown, callback: (value: unknown) => void) => callback({ ok: true }) } });
    await expect(requestTmdbCandidates(payload)).resolves.toEqual({
      error: expect.objectContaining({ code: "TMDB_EMPTY_RESPONSE" }),
      ok: false
    });
  });

  it("returns a typed error when runtime messaging is unavailable", async () => {
    vi.stubGlobal("chrome", undefined);
    await expect(requestTmdbCandidates(payload)).resolves.toEqual({
      error: expect.objectContaining({ code: "CHROME_RUNTIME_UNAVAILABLE" }),
      ok: false
    });
  });
});
