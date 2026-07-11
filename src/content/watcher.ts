import { renderOpenInStremioButton, removeOpenInStremioButton } from "./buttonRenderer";
import { observeDocumentChanges, observeYouTubeNavigation } from "./navigation";
import { injectStyles } from "./styles";
import { extractCurrentVideo, isYouTubeWatchPage } from "../youtube/videoExtractor";

const REFRESH_DELAY_MS = 150;

type Cleanup = () => void;
interface ScheduledRefresh {
  (): void;
  cancel: () => void;
}
let activeCleanup: Cleanup | null = null;

export function startWatcher(win: Window = window, doc: Document = document): Cleanup {
  if (activeCleanup) return activeCleanup;
  injectStyles(doc);

  const refresh = scheduleTrailingRefresh(() => {
    updateButton(win, doc);
  }, REFRESH_DELAY_MS, win);

  const navigationCleanup = observeYouTubeNavigation(refresh, win);
  const documentCleanup = observeDocumentChanges(refresh, doc);

  refresh();

  activeCleanup = () => {
    refresh.cancel();
    navigationCleanup();
    documentCleanup();
    removeOpenInStremioButton(doc);
    activeCleanup = null;
  };
  return activeCleanup;
}

function updateButton(win: Window, doc: Document): void {
  if (!isYouTubeWatchPage(win.location.href)) {
    removeOpenInStremioButton(doc);
    return;
  }

  const video = extractCurrentVideo(doc, win.location.href);

  if (!video) {
    removeOpenInStremioButton(doc);
    return;
  }

  renderOpenInStremioButton(video, doc);
}

function scheduleTrailingRefresh(callback: () => void, delayMs: number, win: Window = window): ScheduledRefresh {
  let timeoutId: number | undefined;

  const schedule = (): void => {
    if (timeoutId !== undefined) return;
    timeoutId = win.setTimeout(() => {
      timeoutId = undefined;
      callback();
    }, delayMs);
  };

  schedule.cancel = () => {
    if (timeoutId === undefined) return;
    win.clearTimeout(timeoutId);
    timeoutId = undefined;
  };

  return schedule;
}
