import { describe, expect, it } from "vitest";

import { tmdbMultiSearchToCandidates } from "../src/tmdb/candidates";
import type { TmdbMultiSearchResponse } from "../src/tmdb/types";

describe("tmdbMultiSearchToCandidates", () => {
  it("returns up to five movie or TV candidates and ignores people", () => {
    const response: TmdbMultiSearchResponse = {
      page: 1,
      results: [
        {
          adult: false,
          id: 500,
          known_for_department: "Acting",
          media_type: "person",
          name: "Dune Performer",
          popularity: 20,
          profile_path: null
        },
        movieResult(1, "Dune", "2021-09-15"),
        tvResult(2, "Dune: Prophecy", "2024-11-17"),
        movieResult(3, "Dune", "1984-12-14"),
        movieResult(4, "Jodorowsky's Dune", "2013-08-30"),
        tvResult(5, "Frank Herbert's Dune", "2000-12-03"),
        movieResult(6, "Children of Dune", "2003-03-16")
      ],
      total_pages: 1,
      total_results: 7
    };

    expect(tmdbMultiSearchToCandidates(response)).toEqual([
      expect.objectContaining({
        mediaType: "movie",
        releaseDate: "2021-09-15",
        title: "Dune",
        tmdbId: 1,
        year: "2021"
      }),
      expect.objectContaining({
        mediaType: "tv",
        releaseDate: "2024-11-17",
        title: "Dune: Prophecy",
        tmdbId: 2,
        year: "2024"
      }),
      expect.objectContaining({
        mediaType: "movie",
        title: "Dune",
        tmdbId: 3
      }),
      expect.objectContaining({
        mediaType: "movie",
        title: "Jodorowsky's Dune",
        tmdbId: 4
      }),
      expect.objectContaining({
        mediaType: "tv",
        title: "Frank Herbert's Dune",
        tmdbId: 5
      })
    ]);
  });

  it("uses null year and release date when TMDb omits the date", () => {
    const response: TmdbMultiSearchResponse = {
      page: 1,
      results: [movieResult(1, "Untitled Movie", "")],
      total_pages: 1,
      total_results: 1
    };

    expect(tmdbMultiSearchToCandidates(response)[0]).toEqual(
      expect.objectContaining({
        releaseDate: null,
        year: null
      })
    );
  });

  it("filters adult and malformed results and maps validated IMDb IDs", () => {
    const adult = movieResult(1, "Adult", "2020-01-01");
    adult.adult = true;
    const valid = { ...movieResult(2, "Dune", "2021-01-01"), external_ids: { imdb_id: "tt1160419" } };
    const response = { page: 1, results: [adult, { id: "bad", media_type: "movie", title: "Bad" }, valid], total_pages: 1, total_results: 3 };
    expect(tmdbMultiSearchToCandidates(response)).toEqual([expect.objectContaining({ imdbId: "tt1160419", tmdbId: 2 })]);
  });
});

function movieResult(id: number, title: string, releaseDate: string) {
  return {
    adult: false,
    backdrop_path: `/backdrop-${id}.jpg`,
    genre_ids: [12],
    id,
    media_type: "movie" as const,
    original_language: "en",
    original_title: title,
    overview: `${title} overview`,
    popularity: 10,
    poster_path: `/poster-${id}.jpg`,
    release_date: releaseDate,
    title,
    video: false,
    vote_average: 7.5,
    vote_count: 100
  };
}

function tvResult(id: number, name: string, firstAirDate: string) {
  return {
    adult: false,
    backdrop_path: `/backdrop-${id}.jpg`,
    first_air_date: firstAirDate,
    genre_ids: [18],
    id,
    media_type: "tv" as const,
    name,
    origin_country: ["US"],
    original_language: "en",
    original_name: name,
    overview: `${name} overview`,
    popularity: 8,
    poster_path: `/poster-${id}.jpg`,
    vote_average: 8.2,
    vote_count: 80
  };
}
