// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.youtube.com/watch?v=videoA001"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startWatcher } from "../src/content/watcher";

describe("YouTube watcher lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <meta itemprop="videoId" content="videoA001">
      <meta property="og:title" content="Dune Official Trailer">
      <ytd-watch-metadata><h1>Dune Official Trailer</h1></ytd-watch-metadata>
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("does not run a scheduled refresh after teardown", () => {
    const cleanup = startWatcher(window, document);
    cleanup();
    vi.advanceTimersByTime(200);
    expect(document.querySelector("#watcher-open-in-stremio")).toBeNull();
  });

  it("does not let repeated events postpone refresh indefinitely", () => {
    const cleanup = startWatcher(window, document);
    for (let index = 0; index < 5; index += 1) {
      window.dispatchEvent(new Event("yt-page-data-updated"));
      vi.advanceTimersByTime(30);
    }
    expect(document.querySelectorAll("#watcher-open-in-stremio")).toHaveLength(1);
    cleanup();
  });

  it("restores patched history methods during cleanup", () => {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    const cleanup = startWatcher(window, document);
    expect(window.history.pushState).not.toBe(originalPushState);
    cleanup();
    expect(window.history.pushState).toBe(originalPushState);
    expect(window.history.replaceState).toBe(originalReplaceState);
  });
});
