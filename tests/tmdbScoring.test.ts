import { describe, expect, it } from "vitest";

import {
  normalizedTitleSimilarity,
  rankTmdbCandidates,
  selectTmdbCandidate,
  type CandidateScoringContext
} from "../src/tmdb/scoring";
import type { TmdbCandidate } from "../src/tmdb/types";

describe("TMDb candidate scoring", () => {
  it("normalizes punctuation and casing for title similarity", () => {
    expect(normalizedTitleSimilarity("DUNE: PART TWO", "Dune - Part Two")).toBeGreaterThan(0.95);
  });

  it("uses release year to disambiguate matching titles", () => {
    const selection = selectTmdbCandidate(
      [
        candidate({ title: "The Batman", tmdbId: 1, year: "1943" }),
        candidate({ popularity: 100, title: "The Batman", tmdbId: 2, year: "2022" })
      ],
      {
        cleanedTitle: "The Batman (2022)",
        youtubeTitle: "The Batman (2022) Official Trailer"
      },
      { confidenceThreshold: 0.9 }
    );

    expect(selection.kind).toBe("best_match");

    if (selection.kind === "best_match") {
      expect(selection.candidate.candidate.tmdbId).toBe(2);
      expect(selection.candidate.breakdown.releaseYear).toBe(1);
    }
  });

  it("uses media type hints from noisy YouTube titles", () => {
    const ranked = rankTmdbCandidates(
      [
        candidate({ mediaType: "tv", title: "Dune", tmdbId: 1 }),
        candidate({ mediaType: "movie", title: "Dune", tmdbId: 2 })
      ],
      {
        cleanedTitle: "Dune",
        youtubeTitle: "Dune Movie Clip"
      }
    );

    expect(ranked[0].candidate.tmdbId).toBe(2);
    expect(ranked[0].breakdown.mediaType).toBe(1);
    expect(ranked[1].breakdown.mediaType).toBe(0);
  });

  it("boosts candidates whose actors are found in the YouTube description", () => {
    const ranked = rankTmdbCandidates(
      [
        candidate({
          actorNames: ["Kyle MacLachlan", "Francesca Annis"],
          title: "Dune",
          tmdbId: 1,
          year: "1984"
        }),
        candidate({
          actorNames: ["Timothee Chalamet", "Zendaya"],
          title: "Dune",
          tmdbId: 2,
          year: "2021"
        })
      ],
      {
        cleanedTitle: "Dune",
        youtubeDescription: "Starring Timothee Chalamet, Zendaya, Rebecca Ferguson, and Oscar Isaac."
      }
    );

    expect(ranked[0].candidate.tmdbId).toBe(2);
    expect(ranked[0].details.matchedActors).toEqual(["Timothee Chalamet", "Zendaya"]);
    expect(ranked[0].breakdown.actorMatch).toBe(1);
  });

  it("uses actors mentioned in the YouTube title when the description is empty", () => {
    const ranked = rankTmdbCandidates([
      candidate({ actorNames: ["Emma Stone"], title: "Poor Things", tmdbId: 1 }),
      candidate({ actorNames: ["Jane Example"], title: "Poor Things", tmdbId: 2 })
    ], {
      cleanedTitle: "Poor Things",
      youtubeTitle: "Emma Stone in Poor Things - Official Clip"
    });
    expect(ranked[0].candidate.tmdbId).toBe(1);
    expect(ranked[0].details.matchedActors).toEqual(["Emma Stone"]);
  });

  it("uses channel names against candidate network and production company names", () => {
    const ranked = rankTmdbCandidates(
      [
        candidate({
          mediaType: "movie",
          productionCompanyNames: ["The Asylum"],
          title: "The Last of Us",
          tmdbId: 1
        }),
        candidate({
          mediaType: "tv",
          networkNames: ["HBO"],
          title: "The Last of Us",
          tmdbId: 2
        })
      ],
      {
        channelName: "HBO Max",
        cleanedTitle: "The Last of Us"
      }
    );

    expect(ranked[0].candidate.tmdbId).toBe(2);
    expect(ranked[0].details.matchedChannelNames).toEqual(["HBO"]);
    expect(ranked[0].breakdown.channelName).toBe(1);
  });

  it("favors TV candidates when season and episode notation is present", () => {
    const ranked = rankTmdbCandidates(
      [
        candidate({ mediaType: "movie", title: "Breaking Bad", tmdbId: 1 }),
        candidate({ mediaType: "tv", title: "Breaking Bad", tmdbId: 2 })
      ],
      {
        cleanedTitle: "Breaking Bad S05E14 Ozymandias",
        youtubeTitle: "Breaking Bad - S05E14 Ozymandias Ending Scene"
      }
    );

    expect(ranked[0].candidate.tmdbId).toBe(2);
    expect(ranked[0].details.expectedMediaType).toBe("tv");
    expect(ranked[0].breakdown.seasonEpisode).toBe(1);
  });

  it("returns the best result only when confidence clears the threshold", () => {
    const selection = selectTmdbCandidate(
      [
        candidate({ popularity: 30, title: "The Space Show", tmdbId: 1 }),
        candidate({ popularity: 20, title: "Space Showdown", tmdbId: 2 }),
        candidate({ popularity: 10, title: "A Space Story", tmdbId: 3 }),
        candidate({ popularity: 5, title: "Kitchen Mysteries", tmdbId: 4 })
      ],
      {
        cleanedTitle: "Space Show"
      },
      { confidenceThreshold: 0.95 }
    );

    expect(selection.kind).toBe("needs_selection");

    if (selection.kind === "needs_selection") {
      expect(selection.candidates).toHaveLength(3);
      expect(selection.candidates.map((scoredCandidate) => scoredCandidate.candidate.tmdbId)).toEqual([1, 2, 3]);
    }
  });

  it("returns a single best match above the configured threshold", () => {
    const selection = selectTmdbCandidate([candidate({ title: "Oppenheimer", tmdbId: 1 })], confidentContext(), {
      confidenceThreshold: 0.8
    });

    expect(selection.kind).toBe("best_match");

    if (selection.kind === "best_match") {
      expect(selection.candidate.candidate.tmdbId).toBe(1);
      expect(selection.candidate.confidence).toBeGreaterThanOrEqual(0.8);
    }
  });

  it("requires user selection when two high-confidence results are too close", () => {
    const selection = selectTmdbCandidate([
      candidate({ title: "Dune", tmdbId: 1, year: "1984" }),
      candidate({ title: "Dune", tmdbId: 2, year: "2021" })
    ], { cleanedTitle: "Dune" }, { confidenceThreshold: 0.7 });
    expect(selection.kind).toBe("needs_selection");
  });
});

function confidentContext(): CandidateScoringContext {
  return {
    cleanedTitle: "Oppenheimer",
    youtubeTitle: "Oppenheimer Official Trailer"
  };
}

function candidate(overrides: Partial<TmdbCandidate>): TmdbCandidate {
  return {
    actorNames: [],
    backdropPath: null,
    imdbId: null,
    mediaType: "movie",
    networkNames: [],
    originalTitle: overrides.title ?? "Example",
    overview: "",
    popularity: 0,
    posterPath: null,
    productionCompanyNames: [],
    releaseDate: overrides.year ? `${overrides.year}-01-01` : null,
    title: "Example",
    tmdbId: 1,
    voteAverage: 0,
    voteCount: 0,
    year: null,
    ...overrides
  };
}
