// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { extractCurrentVideo, extractVideoIdFromUrl, isYouTubeWatchPage } from "../src/youtube/videoExtractor";

describe("YouTube metadata extraction", () => {
  it("extracts normalized metadata from stable page elements", () => {
    document.body.innerHTML = `
      <meta itemprop="videoId" content="abc123XYZ_0">
      <meta property="og:title" content="Dune (2021) Official Trailer 4K">
      <meta property="og:description" content="Starring Timothee Chalamet">
      <ytd-watch-metadata><ytd-channel-name><a>Warner Bros. Pictures</a></ytd-channel-name></ytd-watch-metadata>
    `;
    const video = extractCurrentVideo(document, "https://www.youtube.com/watch?v=abc123XYZ_0&list=PL1");
    expect(video).toEqual(expect.objectContaining({
      channelName: "Warner Bros. Pictures",
      description: "Starring Timothee Chalamet",
      probableMediaTitle: "Dune (2021)",
      videoId: "abc123XYZ_0"
    }));
  });

  it("rejects metadata left over from the previous SPA video", () => {
    document.body.innerHTML = `<meta itemprop="videoId" content="oldVideo01"><meta property="og:title" content="Old title">`;
    expect(extractCurrentVideo(document, "https://www.youtube.com/watch?v=newVideo02")).toBeNull();
  });

  it("recognizes only YouTube watch URLs with a video ID", () => {
    expect(isYouTubeWatchPage("https://www.youtube.com/watch?v=abc123XYZ_0")).toBe(true);
    expect(isYouTubeWatchPage("https://www.youtube.com/shorts/abc123XYZ_0")).toBe(false);
    expect(extractVideoIdFromUrl("https://attacker.test/watch?v=abc123XYZ_0")).toBeNull();
  });
});
