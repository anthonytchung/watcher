import { describe, expect, it } from "vitest";

import {
  cleanTitle,
  normalizeTitleWhitespace,
  normalizeMediaQuery,
  stripDecorativeEdges,
  stripNotificationCount,
  stripYouTubeSuffix,
  toProbableMediaTitle
} from "../src/youtube/titleCleaner";

describe("titleCleaner", () => {
  describe("stripNotificationCount", () => {
    it("removes a leading YouTube notification count", () => {
      expect(stripNotificationCount("(12) Example title")).toBe("Example title");
    });

    it("leaves counts that are part of the title", () => {
      expect(stripNotificationCount("Example title (12)")).toBe("Example title (12)");
    });
  });

  describe("stripYouTubeSuffix", () => {
    it("removes the standard browser title suffix", () => {
      expect(stripYouTubeSuffix("Example title - YouTube")).toBe("Example title");
    });

    it("supports en dash and em dash suffix separators", () => {
      expect(stripYouTubeSuffix("Example title – YouTube")).toBe("Example title");
      expect(stripYouTubeSuffix("Example title — YouTube")).toBe("Example title");
    });

    it("does not remove YouTube when it is part of the title", () => {
      expect(stripYouTubeSuffix("Why YouTube changed search")).toBe("Why YouTube changed search");
    });
  });

  describe("normalizeTitleWhitespace", () => {
    it("collapses repeated whitespace and trims the result", () => {
      expect(normalizeTitleWhitespace("  Example\t title\n\nhere  ")).toBe("Example title here");
    });
  });

  describe("stripDecorativeEdges", () => {
    it("removes edge separators left after other cleanup", () => {
      expect(stripDecorativeEdges(" - Example title | ")).toBe("Example title");
    });
  });

  describe("cleanTitle", () => {
    it("applies the full cleanup pipeline", () => {
      expect(cleanTitle("\u200B(3)  - Example\t title — YouTube  ")).toBe("Example title");
    });

    it("returns an empty string for whitespace-only input", () => {
      expect(cleanTitle(" \n\t ")).toBe("");
    });
  });

  describe("toProbableMediaTitle", () => {
    interface MediaTitleExample {
      rawTitle: string;
      expected: string;
    }

    const examples: MediaTitleExample[] = [
      {
        rawTitle: "Dune: Part Two | Official Trailer",
        expected: "Dune: Part Two"
      },
      {
        rawTitle: "The Batman - Official Trailer (2022) | Warner Bros.",
        expected: "The Batman (2022)"
      },
      {
        rawTitle: "John Wick: Chapter 4 (2023) Official Trailer - Keanu Reeves",
        expected: "John Wick: Chapter 4 (2023)"
      },
      {
        rawTitle: "The Matrix (1999) Movie Clip - Dodging Bullets [HD]",
        expected: "The Matrix (1999)"
      },
      {
        rawTitle: "Blade Runner 2049 - 4K Trailer",
        expected: "Blade Runner 2049"
      },
      {
        rawTitle: "1917 - Official Trailer [HD]",
        expected: "1917"
      },
      {
        rawTitle: "It (2017) - Official Trailer",
        expected: "It (2017)"
      },
      {
        rawTitle: "Us Official Trailer HD",
        expected: "Us"
      },
      {
        rawTitle: "Alien: Romulus | Ending Scene 4K",
        expected: "Alien: Romulus"
      },
      {
        rawTitle: "Parasite Ending Explained",
        expected: "Parasite"
      },
      {
        rawTitle: "Oppenheimer Review - Christopher Nolan",
        expected: "Oppenheimer"
      },
      {
        rawTitle: "Barbie (2023) Movie Review",
        expected: "Barbie (2023)"
      },
      {
        rawTitle: "The Last of Us Season 1 Episode 3 Reaction",
        expected: "The Last of Us Season 1 Episode 3"
      },
      {
        rawTitle: "Breaking Bad - S05E14 Ozymandias Ending Scene",
        expected: "Breaking Bad S05E14 Ozymandias"
      },
      {
        rawTitle: "Better Call Saul 6x13 Saul Gone Explained",
        expected: "Better Call Saul 6x13 Saul Gone"
      },
      {
        rawTitle: "The Office - Dinner Party (Season 4, Episode 13) - Review",
        expected: "The Office Dinner Party (Season 4, Episode 13)"
      },
      {
        rawTitle: "Game of Thrones Season 8 Episode 6 Ending Explained",
        expected: "Game of Thrones Season 8 Episode 6"
      },
      {
        rawTitle: "Avatar: The Last Airbender | S1E1 | Reaction",
        expected: "Avatar: The Last Airbender S1E1"
      },
      {
        rawTitle: "LOST: The Constant (S04E05) Explained",
        expected: "LOST: The Constant (S04E05)"
      },
      {
        rawTitle: "Andor: Season 2 | Official Trailer | Disney+",
        expected: "Andor: Season 2"
      },
      {
        rawTitle: "The Bear Season 2 Episode 6 Review HD",
        expected: "The Bear Season 2 Episode 6"
      },
      {
        rawTitle: "Spider-Man: No Way Home | Official Trailer HD",
        expected: "Spider-Man: No Way Home"
      },
      {
        rawTitle: "The Lord of the Rings: The Fellowship of the Ring | Official Trailer | Warner Bros. Entertainment",
        expected: "The Lord of the Rings: The Fellowship of the Ring"
      },
      {
        rawTitle: "Official Trailer | Fallout Season 1 | Prime Video",
        expected: "Fallout Season 1"
      }
    ];

    it.each(examples)("converts $rawTitle", ({ rawTitle, expected }) => {
      expect(toProbableMediaTitle(rawTitle)).toBe(expected);
    });
  });

  describe("normalizeMediaQuery", () => {
    it.each([
      ["Dune (2021) Official Trailer 4K", { probableTitle: "Dune (2021)", year: 2021, mediaTypeHint: undefined }],
      ["The Bear Season 2 Episode 6 Ending Explained", { probableTitle: "The Bear Season 2 Episode 6", season: 2, episode: 6, mediaTypeHint: "series" }],
      ["Fallout S01E03 Full Scene HD", { probableTitle: "Fallout S01E03", season: 1, episode: 3, mediaTypeHint: "series" }],
      ["Her (2013) Movie Review", { probableTitle: "Her (2013)", year: 2013, mediaTypeHint: "movie" }],
      ["Roma | Tráiler Oficial | 2018", { probableTitle: "Roma 2018", year: 2018, mediaTypeHint: undefined }]
    ])("extracts structured information from %s", (rawTitle, expected) => {
      expect(normalizeMediaQuery(rawTitle)).toEqual(expect.objectContaining(expected));
    });

    it("records removed qualifiers and useful alternate queries", () => {
      const result = normalizeMediaQuery("Blade Runner (1982) Official Trailer Remastered 4K");
      expect(result.removedQualifiers).toEqual(expect.arrayContaining(["official trailer", "remastered", "4k"]));
      expect(result.alternativeQueries).toContain("Blade Runner");
    });
  });
});
