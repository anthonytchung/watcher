import { describe, expect, it } from "vitest";

import type { ContextualMediaEvidence } from "../src/context/evidence";
import { rankEpisodeCandidates, selectEpisodeMatch, type EpisodeCandidate } from "../src/context/episodeMatching";

const series = { imdbId: "tt1305826", seriesTitle: "Adventure Time", tmdbId: 15260 };

describe("contextual episode matching", () => {
  it("returns an exact episode only when explicit season and episode evidence matches", () => {
    const match = selectEpisodeMatch(episodes(), evidence({
      episodeHints: [3],
      sceneDescriptions: ["Simon Petrikov remembers Marceline"],
      seasonHints: [5]
    }), series);

    expect(match.matchLevel).toBe("exact_episode");
    expect(match.seasonNumber).toBe(5);
    expect(match.episodeNumber).toBe(3);
  });

  it("falls back to the series page when characters are useful but episode evidence is weak", () => {
    const match = selectEpisodeMatch(episodes(), evidence({
      characters: ["Simon Petrikov", "Marceline"],
      sceneDescriptions: ["Simon Petrikov Leaves Marceline"]
    }), series);

    expect(["exact_series", "ambiguous_episode"]).toContain(match.matchLevel);
    expect(match.seriesTitle).toBe("Adventure Time");
    expect(match.evidence[0]).toMatch(/Series identified|Several episodes/);
  });

  it("marks episodes ambiguous when several candidates share the same character clue", () => {
    const match = selectEpisodeMatch(episodes(), evidence({
      characters: ["Marceline"],
      sceneDescriptions: ["Marceline sings a sad song"]
    }), series);

    expect(["ambiguous_episode", "exact_series"]).toContain(match.matchLevel);
    expect(match.alternatives.length).toBeGreaterThan(1);
  });

  it("ranks an episode higher when several independent clues agree", () => {
    const ranked = rankEpisodeCandidates(episodes(), evidence({
      characters: ["Simon Petrikov", "Marceline"],
      dialogueFragments: ["I remember you"],
      sceneDescriptions: ["Simon Petrikov remembers Marceline"],
      seasonHints: [5]
    }));

    expect(ranked[0].candidate.episodeTitle).toBe("I Remember You");
    expect(ranked[0].evidence.length).toBeGreaterThanOrEqual(2);
  });

  it("handles transcript unavailable by relying on other evidence", () => {
    const match = selectEpisodeMatch(episodes(), evidence({
      transcriptExcerpts: [],
      seasonHints: [5]
    }), series);

    expect(match.matchLevel).toBe("exact_series");
  });
});

function episodes(): EpisodeCandidate[] {
  return [
    {
      episodeNumber: 3,
      episodeTitle: "I Remember You",
      overview: "Ice King asks Marceline to help him write a song, revealing Simon Petrikov's past and their shared memories.",
      seasonNumber: 5
    },
    {
      episodeNumber: 14,
      episodeTitle: "Simon & Marcy",
      overview: "A flashback follows Simon Petrikov protecting young Marceline after the Mushroom War.",
      seasonNumber: 5
    },
    {
      episodeNumber: 1,
      episodeTitle: "Evicted!",
      overview: "Marceline scares Finn and Jake from their tree house.",
      seasonNumber: 1
    }
  ];
}

function evidence(overrides: Partial<ContextualMediaEvidence>): ContextualMediaEvidence {
  return {
    actors: [],
    channelName: "Cartoon Network",
    chapters: [],
    characters: [],
    cleanedTitle: "Adventure Time",
    description: "",
    dialogueFragments: [],
    episodeHints: [],
    franchiseHints: [],
    hashtags: [],
    mediaTypeHint: "series",
    probableTitles: ["Adventure Time"],
    rawTitle: "Adventure Time",
    sceneDescriptions: [],
    seasonHints: [],
    structuredMetadata: {},
    transcriptExcerpts: [],
    videoUrl: "https://www.youtube.com/watch?v=abc123XYZ_0",
    yearHints: [],
    youtubeVideoId: "abc123XYZ_0",
    ...overrides
  };
}
