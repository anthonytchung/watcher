import { describe, expect, it } from "vitest";

import { handleRuntimeMessage, isOpenStremioWebRequest, isTmdbMultiSearchRequest } from "../src/background/messages";
import { WATCHER_OPEN_STREMIO_WEB, WATCHER_TMDB_MULTI_SEARCH } from "../src/messages/tmdbMessages";

const validRequest = {
  payload: { cleanedTitle: "Dune", videoId: "n9xhJrPXop4" },
  type: WATCHER_TMDB_MULTI_SEARCH
};

const validOpenRequest = {
  payload: { url: "https://web.stremio.com/#/search?search=Adventure%20Time" },
  type: WATCHER_OPEN_STREMIO_WEB
};

const nativeProtocolUrl = ["stremio", ":///", "search?search=Adventure%20Time"].join("");

describe("runtime message validation", () => {
  it("accepts a minimal valid request", () => expect(isTmdbMultiSearchRequest(validRequest)).toBe(true));
  it("accepts a bounded contextual evidence payload", () => {
    expect(isTmdbMultiSearchRequest({
      ...validRequest,
      payload: {
        ...validRequest.payload,
        contextualEvidence: contextualEvidence()
      }
    })).toBe(true);
  });

  it.each([
    null,
    {},
    { ...validRequest, type: "unknown" },
    { ...validRequest, payload: { cleanedTitle: "", videoId: "n9xhJrPXop4" } },
    { ...validRequest, payload: { cleanedTitle: "Dune", videoId: "../bad" } },
    { ...validRequest, payload: { cleanedTitle: "x".repeat(201), videoId: "n9xhJrPXop4" } },
    { ...validRequest, payload: { cleanedTitle: "Dune", confidenceThreshold: 2, videoId: "n9xhJrPXop4" } },
    { ...validRequest, payload: { cleanedTitle: "Dune", videoId: "n9xhJrPXop4", youtubeDescription: "x".repeat(2001) } },
    {
      ...validRequest,
      payload: {
        ...validRequest.payload,
        contextualEvidence: { ...contextualEvidence(), transcriptExcerpts: ["x".repeat(501)] }
      }
    }
  ])("rejects malformed request %#", (request) => expect(isTmdbMultiSearchRequest(request)).toBe(false));

  it("rejects messages from non-YouTube senders", () => {
    expect(handleRuntimeMessage(validRequest, "https://attacker.test/watch?v=n9xhJrPXop4")).toBeUndefined();
  });

  it("returns a serializable missing-configuration error", async () => {
    await expect(handleRuntimeMessage(validRequest, "https://www.youtube.com/watch?v=n9xhJrPXop4")).resolves.toEqual({
      error: expect.objectContaining({ code: "TMDB_PROXY_NOT_CONFIGURED" }),
      ok: false
    });
  });

  it("accepts valid Stremio Web tab-open requests", () => {
    expect(isOpenStremioWebRequest(validOpenRequest)).toBe(true);
  });

  it.each([
    { payload: { url: nativeProtocolUrl }, type: WATCHER_OPEN_STREMIO_WEB },
    { payload: { url: "https://attacker.test/#/search?search=Adventure%20Time" }, type: WATCHER_OPEN_STREMIO_WEB },
    { payload: { url: "https://web.stremio.com/#/addon/https://attacker.test/manifest.json" }, type: WATCHER_OPEN_STREMIO_WEB },
    { payload: { url: "https://web.stremio.com/#/detail/movie/not-imdb" }, type: WATCHER_OPEN_STREMIO_WEB },
    { payload: { url: "" }, type: WATCHER_OPEN_STREMIO_WEB }
  ])("rejects malformed Stremio Web tab-open request %#", (request) => {
    expect(isOpenStremioWebRequest(request)).toBe(false);
  });

  it("opens Stremio Web in a new tab through the supplied tab opener", async () => {
    const openedUrls: string[] = [];
    await expect(handleRuntimeMessage(
      validOpenRequest,
      "https://www.youtube.com/watch?v=n9xhJrPXop4",
      async (url) => {
        openedUrls.push(url);
        return 123;
      }
    )).resolves.toEqual({ ok: true, tabId: 123 });
    expect(openedUrls).toEqual(["https://web.stremio.com/#/search?search=Adventure%20Time"]);
  });

  it("does not open Stremio Web tabs for non-YouTube senders", () => {
    const openedUrls: string[] = [];
    expect(handleRuntimeMessage(validOpenRequest, "https://attacker.test/watch?v=n9xhJrPXop4", async (url) => {
      openedUrls.push(url);
      return 123;
    })).toBeUndefined();
    expect(openedUrls).toEqual([]);
  });
});

function contextualEvidence() {
  return {
    actors: [],
    channelName: "Cartoon Network",
    chapters: [],
    characters: ["Simon Petrikov", "Marceline"],
    cleanedTitle: "Adventure Time",
    dialogueFragments: [],
    episodeHints: [],
    franchiseHints: [],
    hashtags: ["#AdventureTime"],
    mediaTypeHint: "series",
    probableTitles: ["Adventure Time"],
    rawTitle: "Adventure Time: Simon Petrikov Leaves Marceline",
    sceneDescriptions: ["Simon Petrikov Leaves Marceline"],
    seasonHints: [],
    structuredMetadata: {},
    transcriptExcerpts: [],
    videoUrl: "https://www.youtube.com/watch?v=n9xhJrPXop4",
    yearHints: [],
    youtubeVideoId: "n9xhJrPXop4"
  };
}
