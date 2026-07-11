// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WatcherTmdbMultiSearchResponse } from "../src/messages/tmdbMessages";
import type { YouTubeVideoInfo } from "../src/youtube/types";

const { openStremioWebUrl, requestTmdbCandidates } = vi.hoisted(() => ({
  openStremioWebUrl: vi.fn(),
  requestTmdbCandidates: vi.fn()
}));
vi.mock("../src/content/tmdbSearchClient", () => ({ requestTmdbCandidates }));
vi.mock("../src/content/stremioWebLauncher", () => ({ openStremioWebUrl }));

import { renderOpenInStremioButton, removeOpenInStremioButton } from "../src/content/buttonRenderer";

describe("Open in Stremio UI", () => {
  beforeEach(() => {
    removeOpenInStremioButton(document);
    document.body.innerHTML = "<ytd-watch-metadata><h1>Video title</h1></ytd-watch-metadata>";
    openStremioWebUrl.mockReset();
    openStremioWebUrl.mockResolvedValue({ ok: true });
    requestTmdbCandidates.mockReset();
  });

  it("injects one accessible control and does not duplicate it", () => {
    renderOpenInStremioButton(video("videoA001"), document);
    renderOpenInStremioButton(video("videoA001"), document);
    expect(document.querySelectorAll("#watcher-open-in-stremio")).toHaveLength(1);
    expect(document.querySelector("button")?.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("reattaches its row when YouTube replaces the title container", () => {
    renderOpenInStremioButton(video("videoA001"), document);
    document.body.innerHTML = "<ytd-watch-metadata><h1>Replacement title</h1></ytd-watch-metadata>";
    renderOpenInStremioButton(video("videoA001"), document);
    expect(document.querySelector("h1")?.nextElementSibling?.id).toBe("watcher-stremio-button-row");
  });

  it("falls back to the watch metadata container when YouTube title anchors are unavailable", () => {
    document.body.innerHTML = "<ytd-watch-metadata><div id=\"above-the-fold\"><div id=\"top-row\"></div></div></ytd-watch-metadata>";
    expect(renderOpenInStremioButton(video("videoA001"), document)).toBe(true);
    expect(document.querySelector("#top-row")?.previousElementSibling?.id).toBe("watcher-stremio-button-row");
  });

  it("ignores a stale response after navigation to another video", async () => {
    let resolveFirst!: (response: WatcherTmdbMultiSearchResponse) => void;
    requestTmdbCandidates.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }));
    renderOpenInStremioButton(video("videoA001"), document);
    (document.querySelector("#watcher-open-in-stremio") as HTMLButtonElement).click();
    renderOpenInStremioButton(video("videoB002"), document);
    resolveFirst({ ok: true, query: "Dune", result: { candidates: [], confidenceThreshold: 0.74, kind: "needs_selection" } });
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector("#watcher-stremio-panel")).toBeNull();
    expect(document.querySelector("#watcher-open-in-stremio")?.textContent).toBe("Open in Stremio");
  });

  it("renders a compact featured result with a poster fallback and explicit action", async () => {
    requestTmdbCandidates.mockResolvedValueOnce(bestMatchResponse());
    renderOpenInStremioButton(video("videoA001"), document);
    (document.querySelector("#watcher-open-in-stremio") as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector("#watcher-stremio-panel")?.getAttribute("role")).toBe("dialog");
    expect(document.querySelector(".watcher-poster")?.textContent).toBe("Movie");
    expect(document.querySelector(".watcher-candidate-details strong")?.textContent).toBe("Dune");
    expect(document.querySelector(".watcher-candidate-metadata")?.textContent).toBe("2021 · Movie");
    expect(document.querySelector(".watcher-primary-action")?.textContent).toBe("Open in Stremio Web");
  });

  it("dismisses with Escape and ignores the pending response", async () => {
    let resolveSearch!: (response: WatcherTmdbMultiSearchResponse) => void;
    requestTmdbCandidates.mockReturnValueOnce(new Promise((resolve) => { resolveSearch = resolve; }));
    renderOpenInStremioButton(video("videoA001"), document);
    const trigger = document.querySelector("#watcher-open-in-stremio") as HTMLButtonElement;
    trigger.click();
    document.querySelector("#watcher-stremio-panel")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    resolveSearch(bestMatchResponse());
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector("#watcher-stremio-panel")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("renders safe selectable candidates and updates the explicit action", async () => {
    requestTmdbCandidates.mockResolvedValueOnce(ambiguousResponse());
    renderOpenInStremioButton(video("videoA001"), document);
    (document.querySelector("#watcher-open-in-stremio") as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    const candidates = [...document.querySelectorAll<HTMLButtonElement>(".watcher-candidate")];
    expect(candidates).toHaveLength(2);
    expect(candidates[0].getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("script")).toBeNull();
    candidates[1].click();
    expect(candidates[0].getAttribute("aria-pressed")).toBe("false");
    expect(candidates[1].getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".watcher-primary-action")?.textContent).toBe("Search selected in Stremio Web");
  });

  it("announces loading and prevents duplicate searches", () => {
    requestTmdbCandidates.mockReturnValueOnce(new Promise(() => undefined));
    renderOpenInStremioButton(video("videoA001"), document);
    const trigger = document.querySelector("#watcher-open-in-stremio") as HTMLButtonElement;
    trigger.click();
    trigger.click();
    expect(trigger.disabled).toBe(true);
    expect(trigger.textContent).toBe("Finding this title...");
    expect(document.querySelector('[role="status"]')?.textContent).toBe("Checking for matches...");
    expect(requestTmdbCandidates).toHaveBeenCalledOnce();
  });

  it("distinguishes empty results from a technical error", async () => {
    requestTmdbCandidates.mockResolvedValueOnce({
      ok: true,
      query: "Dune",
      result: { candidates: [], confidenceThreshold: 0.74, kind: "needs_selection" }
    });
    renderOpenInStremioButton(video("videoA001"), document);
    (document.querySelector("#watcher-open-in-stremio") as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector("h2")?.textContent).toBe("Couldn't identify this title");
    expect(document.querySelector('[role="alert"]')).toBeNull();

    requestTmdbCandidates.mockResolvedValueOnce({ error: { code: "TMDB_PROXY_UNAVAILABLE", message: "secret detail" }, ok: false });
    (document.querySelector("#watcher-open-in-stremio") as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector("h2")?.textContent).toBe("Search unavailable");
    expect(document.querySelector('[role="alert"]')?.textContent).not.toContain("secret detail");
    expect(document.querySelector(".watcher-primary-action")?.textContent).toBe("Search Stremio Web");
    expect(document.querySelector(".watcher-secondary-action")?.textContent).toBe("Try again");
  });

  it("renders missing configuration as a neutral editable Stremio Web search fallback", async () => {
    requestTmdbCandidates.mockResolvedValueOnce({ error: { code: "TMDB_PROXY_NOT_CONFIGURED", message: "not configured" }, ok: false });
    renderOpenInStremioButton(video("videoA001"), document);
    (document.querySelector("#watcher-open-in-stremio") as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    const input = document.querySelector<HTMLInputElement>(".watcher-manual-search input");
    expect(document.querySelector("h2")?.textContent).toBe("Automatic matching isn't set up");
    expect(document.querySelector('[role="status"]')?.textContent).toBe("You can still search Stremio Web using the detected video title.");
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(input?.value).toBe("Dune");
    expect(input?.getAttribute("aria-label")).toBe("Movie or series title");
    expect(document.querySelector(".watcher-primary-action")?.textContent).toBe("Search Stremio Web");
    expect(document.querySelector(".watcher-secondary-action")).toBeNull();
  });

  it("opens Stremio Web search in a new tab request without navigating the YouTube tab", async () => {
    requestTmdbCandidates.mockResolvedValueOnce({ error: { code: "TMDB_PROXY_NOT_CONFIGURED", message: "not configured" }, ok: false });
    renderOpenInStremioButton(video("videoA001"), document);
    (document.querySelector("#watcher-open-in-stremio") as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    const beforeUrl = window.location.href;
    const input = document.querySelector<HTMLInputElement>(".watcher-manual-search input");
    const form = document.querySelector<HTMLFormElement>(".watcher-manual-search");
    if (!input || !form) throw new Error("Expected manual search form.");
    input.value = "Adventure Time";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(openStremioWebUrl).toHaveBeenCalledWith("https://web.stremio.com/#/search?search=Adventure%20Time");
    expect(window.location.href).toBe(beforeUrl);
    expect(document.querySelector('[role="status"]')?.textContent).toBe("Opened Stremio Web in a new tab.");
  });

  it("opens exact matched candidates through Stremio Web detail URLs", async () => {
    requestTmdbCandidates.mockResolvedValueOnce(bestMatchResponse());
    renderOpenInStremioButton(video("videoA001"), document);
    (document.querySelector("#watcher-open-in-stremio") as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    (document.querySelector(".watcher-primary-action") as HTMLButtonElement).click();
    await Promise.resolve();
    expect(openStremioWebUrl).toHaveBeenCalledWith("https://web.stremio.com/#/detail/movie/tt1160419");
  });
});

function ambiguousResponse(): WatcherTmdbMultiSearchResponse {
  const first = bestMatchResponse();
  if (!first.ok || first.result.kind !== "best_match") throw new Error("Expected best-match fixture.");
  const second = structuredClone(first.result.candidate);
  second.candidate.imdbId = null;
  second.candidate.title = "Dune <script>alert(1)</script>";
  second.candidate.tmdbId = 841;
  second.candidate.year = "1984";
  return {
    ok: true,
    query: "Dune",
    result: { candidates: [first.result.candidate, second], confidenceThreshold: 0.74, kind: "needs_selection" }
  };
}

function bestMatchResponse(): WatcherTmdbMultiSearchResponse {
  return {
    ok: true,
    query: "Dune",
    result: {
      candidate: {
        breakdown: { actorMatch: 0, channelName: 0, mediaType: 1, releaseYear: 1, seasonEpisode: 0, titleSimilarity: 1 },
        candidate: {
          actorNames: [], backdropPath: null, imdbId: "tt1160419", mediaType: "movie", networkNames: [], originalTitle: "Dune",
          overview: "", popularity: 100, posterPath: null, productionCompanyNames: [], releaseDate: "2021-10-22", title: "Dune",
          tmdbId: 438631, voteAverage: 8, voteCount: 1000, year: "2021"
        },
        confidence: 1,
        confidenceLevel: "high",
        details: { activeFactors: ["titleSimilarity"], expectedMediaType: "movie", matchedActors: [], matchedChannelNames: [], sourceSeasonEpisode: null, sourceYears: ["2021"] },
        reasons: ["Title closely matches"]
      },
      confidenceThreshold: 0.74,
      kind: "best_match"
    }
  };
}

function video(videoId: string): YouTubeVideoInfo {
  return {
    channelName: "Warner Bros.", description: "", normalizedQuery: { alternativeQueries: [], probableTitle: "Dune", rawTitle: "Dune", removedQualifiers: [] },
    probableMediaTitle: "Dune", rawTitle: "Dune", title: "Dune Official Trailer", url: `https://www.youtube.com/watch?v=${videoId}`, videoId
  };
}
