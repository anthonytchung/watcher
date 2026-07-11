import { describe, expect, it } from "vitest";

import { collectContextualMediaEvidence, selectContextualSearchTitle } from "../src/context/evidence";
import type { YouTubeVideoInfo } from "../src/youtube/types";
import { normalizeMediaQuery } from "../src/youtube/titleCleaner";

describe("contextual media evidence", () => {
  it("extracts contextual clues from a scene-style series title without treating the scene as the title", () => {
    const evidence = collectContextualMediaEvidence(video({
      description: "A clip with Simon Petrikov and Marceline from the series. #AdventureTime",
      title: "Adventure Time: Simon Petrikov Leaves Marceline"
    }));

    expect(evidence.probableTitles[0]).toBe("Adventure Time");
    expect(evidence.characters).toEqual(expect.arrayContaining(["Simon Petrikov", "Marceline"]));
    expect(evidence.sceneDescriptions).toContain("Simon Petrikov Leaves Marceline");
    expect(evidence.mediaTypeHint).toBe("series");
    expect(evidence.hashtags).toContain("#AdventureTime");
    expect(selectContextualSearchTitle(evidence)).toBe("Adventure Time");
  });

  it("promotes a show channel when a pipe-separated title segment identifies the series", () => {
    const evidence = collectContextualMediaEvidence(video({
      channelName: "The Amazing World of Gumball",
      description: "Gumball, Darwin, Anais and Penny are featured in Cartoon Network's comedy series. #TAWOG #Gumball",
      title: "Carmen The Know-It-All | The Best | Gumball | Cartoon Network"
    }));

    expect(evidence.probableTitles).toEqual(expect.arrayContaining([
      "The Amazing World of Gumball",
      "Gumball"
    ]));
    expect(evidence.probableTitles[0]).toBe("The Amazing World of Gumball");
    expect(evidence.mediaTypeHint).toBe("series");
    expect(selectContextualSearchTitle(evidence)).toBe("The Amazing World of Gumball");
  });

  it.each([
    {
      expected: { mediaTypeHint: "movie", title: "The Batman", years: [2022] },
      title: "The Batman Movie Official Trailer 2022"
    },
    {
      expected: { episodeHints: [4], mediaTypeHint: "series", seasonHints: [1], title: "Severance S01E04" },
      title: "Severance S01E04 Breakdown"
    },
    {
      expected: { mediaTypeHint: "unknown", title: "Sad scene compilation", years: [] },
      title: "Sad scene compilation"
    }
  ])("extracts deterministic hints from $title", ({ expected, title }) => {
    const evidence = collectContextualMediaEvidence(video({ title }));
    expect(evidence.mediaTypeHint).toBe(expected.mediaTypeHint);
    expect(evidence.yearHints).toEqual(expected.years ?? []);
    expect(evidence.seasonHints).toEqual(expected.seasonHints ?? []);
    expect(evidence.episodeHints).toEqual(expected.episodeHints ?? []);
  });

  it("handles missing transcript, chapters, and useful metadata gracefully", () => {
    const evidence = collectContextualMediaEvidence(video({ description: "", title: "Untitled clip" }));
    expect(evidence.transcriptExcerpts).toEqual([]);
    expect(evidence.chapters).toEqual([]);
    expect(evidence.description).toBeUndefined();
  });

  it("extracts quoted dialogue, chapters, and actor names from page text", () => {
    const evidence = collectContextualMediaEvidence(video({
      description: "00:12 Opening scene\n01:45 Final choice\nStarring Cillian Murphy and Emily Blunt. \"Now I am become death.\"",
      title: "Oppenheimer - ending scene"
    }));
    expect(evidence.chapters).toEqual(["Opening scene", "Final choice"]);
    expect(evidence.actors).toEqual(expect.arrayContaining(["Cillian Murphy", "Emily Blunt"]));
    expect(evidence.dialogueFragments).toContain("Now I am become death");
  });
});

function video(input: { channelName?: string; description?: string; title: string }): YouTubeVideoInfo {
  const normalizedQuery = normalizeMediaQuery(input.title);
  return {
    channelName: input.channelName ?? "Movie Clips",
    description: input.description ?? "",
    normalizedQuery,
    probableMediaTitle: normalizedQuery.probableTitle,
    rawTitle: input.title,
    title: input.title,
    url: "https://www.youtube.com/watch?v=abc123XYZ_0",
    videoId: "abc123XYZ_0"
  };
}
