import { describe, expect, it, vi } from "vitest";

import { buildCacheKey, searchTmdbCandidates, TmdbProxySearchError } from "../src/background/tmdbProxyClient";
import type { TmdbMultiSearchResponse } from "../src/tmdb/types";

describe("searchTmdbCandidates", () => {
  it("returns an empty candidate list for an empty cleaned title without fetching", async () => {
    const fetcher = vi.fn();

    await expect(searchTmdbCandidates("   ", { fetcher })).resolves.toEqual({
      candidates: [],
      query: "",
      source: "tmdb"
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("calls the configured proxy and returns up to five TMDb candidates", async () => {
    const response: TmdbMultiSearchResponse = {
      page: 1,
      results: [
        movieResult(1, "Dune"),
        movieResult(2, "Dune: Part Two"),
        movieResult(3, "Dune Drifter"),
        movieResult(4, "Dune World"),
        movieResult(5, "Dune Warriors"),
        movieResult(6, "Dune Beyond")
      ],
      total_pages: 1,
      total_results: 6
    };
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(response));

    const result = await searchTmdbCandidates("Dune", {
      fetcher,
      language: "en-GB",
      proxyUrl: "https://proxy.example.test/tmdb/multi-search?existing=1"
    });

    expect(fetcher).toHaveBeenCalledOnce();

    const [requestedUrl] = fetcher.mock.calls[0] ?? [];

    if (!(requestedUrl instanceof URL)) {
      throw new Error("Expected TMDb proxy request to use a URL instance.");
    }

    expect(requestedUrl.toString()).toBe(
      "https://proxy.example.test/tmdb/multi-search?existing=1&query=Dune&include_adult=false&language=en-GB"
    );
    expect(result.candidates).toHaveLength(5);
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        mediaType: "movie",
        title: "Dune",
        tmdbId: 1
      })
    );
  });

  it("fails with a typed error when no proxy URL is configured", async () => {
    await expect(searchTmdbCandidates("Dune", { proxyUrl: "" })).rejects.toEqual(
      expect.objectContaining({
        code: "TMDB_PROXY_NOT_CONFIGURED"
      })
    );
  });

  it("returns a typed proxy error when the proxy responds with an error", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json(
        {
          status_code: 7,
          status_message: "Invalid API key.",
          success: false
        },
        { status: 401 }
      )
    );

    await expect(
      searchTmdbCandidates("Dune", {
        fetcher,
        proxyUrl: "https://proxy.example.test/tmdb/multi-search"
      })
    ).rejects.toBeInstanceOf(TmdbProxySearchError);
    await expect(
      searchTmdbCandidates("Dune", {
        fetcher,
        proxyUrl: "https://proxy.example.test/tmdb/multi-search"
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: "TMDB_PROXY_REQUEST_FAILED",
        message: "Invalid API key.",
        status: 401
      })
    );
  });

  it("rejects malformed successful proxy responses", async () => {
    const fetcher = vi.fn(async () => Response.json({ results: "not-an-array" }));
    await expect(searchTmdbCandidates("Malformed", { fetcher, proxyUrl: "https://proxy.example.test/search" }))
      .rejects.toEqual(expect.objectContaining({ code: "TMDB_PROXY_INVALID_RESPONSE" }));
  });

  it("times out a stalled proxy request", async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    await expect(searchTmdbCandidates("Timeout case", { fetcher, proxyUrl: "https://proxy.example.test/search", timeoutMs: 1 }))
      .rejects.toEqual(expect.objectContaining({ code: "TMDB_PROXY_TIMEOUT" }));
  });

  it("normalizes cache keys and includes the proxy endpoint", () => {
    expect(buildCacheKey(" https://proxy-a.test/search ", " DUNE ", "EN-us"))
      .toBe("https://proxy-a.test/search\u0000en-us\u0000dune");
    expect(buildCacheKey("https://proxy-b.test/search", "Dune", "en-US"))
      .not.toBe(buildCacheKey("https://proxy-a.test/search", "Dune", "en-US"));
  });

  it("does not reuse cached results across proxy endpoints", async () => {
    const firstFetcher = vi.fn(async () => Response.json(searchResponse(movieResult(101, "First Proxy Result"))));
    const secondFetcher = vi.fn(async () => Response.json(searchResponse(movieResult(202, "Second Proxy Result"))));
    const first = await searchTmdbCandidates("Proxy isolation title", { fetcher: firstFetcher, proxyUrl: "https://proxy-a.test/search" });
    const second = await searchTmdbCandidates("Proxy isolation title", { fetcher: secondFetcher, proxyUrl: "https://proxy-b.test/search" });
    expect(first.candidates[0]?.tmdbId).toBe(101);
    expect(second.candidates[0]?.tmdbId).toBe(202);
    expect(firstFetcher).toHaveBeenCalledOnce();
    expect(secondFetcher).toHaveBeenCalledOnce();
  });
});

function searchResponse(...results: ReturnType<typeof movieResult>[]): TmdbMultiSearchResponse {
  return { page: 1, results, total_pages: 1, total_results: results.length };
}

function movieResult(id: number, title: string) {
  return {
    adult: false,
    backdrop_path: null,
    genre_ids: [878],
    id,
    media_type: "movie" as const,
    original_language: "en",
    original_title: title,
    overview: "",
    popularity: 10,
    poster_path: null,
    release_date: "2021-09-15",
    title,
    video: false,
    vote_average: 7.5,
    vote_count: 100
  };
}
