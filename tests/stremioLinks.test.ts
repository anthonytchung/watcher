import { describe, expect, it } from "vitest";

import {
  buildStremioWebDetailUrl,
  buildStremioWebSearchUrl,
  buildStremioWebUrl,
  isStremioWebUrl,
  isValidImdbId
} from "../src/stremio/links";

describe("Stremio Web links", () => {
  const nativeProtocolUrl = ["stremio", ":///", "detail/movie/tt1877830"].join("");

  it.each(["tt0066921", "tt1234567890"])("accepts IMDb ID %s", (id) => expect(isValidImdbId(id)).toBe(true));
  it.each(["", "0066921", "tt123", "tt1234567/board", "javascript:alert(1)", "TT0066921"])("rejects invalid IMDb ID %s", (id) => {
    expect(isValidImdbId(id)).toBe(false);
  });

  it("builds an encoded search URL", () => {
    expect(buildStremioWebSearchUrl("Adventure Time")).toBe("https://web.stremio.com/#/search?search=Adventure%20Time");
    expect(buildStremioWebSearchUrl("Dune: Part Two")).toBe("https://web.stremio.com/#/search?search=Dune%3A%20Part%20Two");
  });

  it("builds search URLs for long and non-English queries", () => {
    const longQuery = "The Lord of the Rings: The Fellowship of the Ring Extended Edition";
    expect(buildStremioWebSearchUrl(longQuery)).toBe(`https://web.stremio.com/#/search?search=${encodeURIComponent(longQuery)}`);
    expect(buildStremioWebSearchUrl("千と千尋の神隠し")).toBe("https://web.stremio.com/#/search?search=%E5%8D%83%E3%81%A8%E5%8D%83%E5%B0%8B%E3%81%AE%E7%A5%9E%E9%9A%A0%E3%81%97");
  });

  it("does not build an empty search URL", () => expect(buildStremioWebSearchUrl("  ")).toBeNull());

  it("builds an exact movie detail URL", () => {
    expect(buildStremioWebDetailUrl({ imdbId: "tt1877830", mediaType: "movie" }))
      .toBe("https://web.stremio.com/#/detail/movie/tt1877830");
  });

  it("builds an exact series detail URL", () => {
    expect(buildStremioWebDetailUrl({ imdbId: "tt2861424", mediaType: "tv" }))
      .toBe("https://web.stremio.com/#/detail/series/tt2861424");
  });

  it("builds an exact episode detail URL when season and episode are complete", () => {
    expect(buildStremioWebDetailUrl({ episode: 3, imdbId: "tt2861424", mediaType: "tv", season: 2 }))
      .toBe("https://web.stremio.com/#/detail/series/tt2861424/tt2861424:2:3");
  });

  it.each([
    { episode: 3, imdbId: "tt2861424", mediaType: "tv" as const },
    { imdbId: "tt2861424", mediaType: "tv" as const, season: 2 },
    { episode: 0, imdbId: "tt2861424", mediaType: "tv" as const, season: 2 },
    { episode: 3, imdbId: "tt2861424", mediaType: "tv" as const, season: -1 }
  ])("falls back to a series detail URL when episode notation is incomplete %#", (input) => {
    expect(buildStremioWebDetailUrl(input)).toBe("https://web.stremio.com/#/detail/series/tt2861424");
  });

  it("returns null for exact detail URLs with invalid IMDb IDs", () => {
    expect(buildStremioWebDetailUrl({ imdbId: "2861424", mediaType: "tv" })).toBeNull();
    expect(buildStremioWebDetailUrl({ imdbId: null, mediaType: "movie" })).toBeNull();
  });

  it("falls back to search when a candidate has no valid IMDb ID", () => {
    expect(buildStremioWebUrl({ imdbId: null, mediaType: "movie", title: "Dune: Part Two" }))
      .toBe("https://web.stremio.com/#/search?search=Dune%3A%20Part%20Two");
    expect(buildStremioWebUrl({ imdbId: "bad", mediaType: "tv", title: "Adventure Time" }))
      .toBe("https://web.stremio.com/#/search?search=Adventure%20Time");
  });

  it("permits only generated Stremio Web detail and search URLs", () => {
    expect(isStremioWebUrl("https://web.stremio.com/#/search?search=Dune%20Part%20Two")).toBe(true);
    expect(isStremioWebUrl("https://web.stremio.com/#/detail/movie/tt1877830")).toBe(true);
    expect(isStremioWebUrl("https://web.stremio.com/#/detail/series/tt2861424")).toBe(true);
    expect(isStremioWebUrl("https://web.stremio.com/#/detail/series/tt2861424/tt2861424:2:3")).toBe(true);
    expect(isStremioWebUrl(nativeProtocolUrl)).toBe(false);
    expect(isStremioWebUrl("https://web.stremio.com/#/addon/https://attacker.test/manifest.json")).toBe(false);
    expect(isStremioWebUrl("https://attacker.test/#/search?search=Dune")).toBe(false);
    expect(isStremioWebUrl("https://web.stremio.com/#/detail/series/tt2861424/tt0000000:2:3")).toBe(false);
  });
});
