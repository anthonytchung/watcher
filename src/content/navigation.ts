const LOCATION_CHANGE_EVENT = "watcher:locationchange";

type HistoryMethodName = "pushState" | "replaceState";

type Cleanup = () => void;

type HistoryMethod = History[HistoryMethodName];

interface HistoryPatchState {
  refCount: number;
  originals: Record<HistoryMethodName, HistoryMethod>;
  patched: Record<HistoryMethodName, HistoryMethod>;
}

const patchedWindows = new WeakMap<Window, HistoryPatchState>();

export function observeYouTubeNavigation(onNavigate: () => void, win: Window = window): Cleanup {
  acquireHistoryPatch(win);

  const handleNavigate = (): void => {
    onNavigate();
  };

  win.addEventListener(LOCATION_CHANGE_EVENT, handleNavigate);
  win.addEventListener("popstate", handleNavigate);
  win.addEventListener("yt-navigate-finish", handleNavigate);
  win.addEventListener("yt-page-data-updated", handleNavigate);

  return () => {
    win.removeEventListener(LOCATION_CHANGE_EVENT, handleNavigate);
    win.removeEventListener("popstate", handleNavigate);
    win.removeEventListener("yt-navigate-finish", handleNavigate);
    win.removeEventListener("yt-page-data-updated", handleNavigate);
    releaseHistoryPatch(win);
  };
}

export function observeDocumentChanges(onChange: () => void, doc: Document = document): Cleanup {
  const Observer = doc.defaultView?.MutationObserver ?? MutationObserver;
  const observer = new Observer(() => {
    onChange();
  });

  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true
  });

  return () => {
    observer.disconnect();
  };
}

function acquireHistoryPatch(win: Window): void {
  const existing = patchedWindows.get(win);
  if (existing) {
    existing.refCount += 1;
    return;
  }

  const originals = {
    pushState: win.history.pushState,
    replaceState: win.history.replaceState
  };
  patchedWindows.set(win, {
    refCount: 1,
    originals,
    patched: {
      pushState: patchHistoryMethod(win, "pushState", originals.pushState),
      replaceState: patchHistoryMethod(win, "replaceState", originals.replaceState)
    }
  });
}

function patchHistoryMethod(win: Window, methodName: HistoryMethodName, original: HistoryMethod): HistoryMethod {
  const patched = function patchedHistoryMethod(
    this: History,
    ...args: Parameters<History[HistoryMethodName]>
  ): ReturnType<History[HistoryMethodName]> {
    const result = original.apply(this, args);
    const event = win.document.createEvent("Event");
    event.initEvent(LOCATION_CHANGE_EVENT, false, false);
    win.dispatchEvent(event);

    return result;
  } as HistoryMethod;
  win.history[methodName] = patched;
  return patched;
}

function releaseHistoryPatch(win: Window): void {
  const state = patchedWindows.get(win);
  if (!state) return;
  state.refCount -= 1;
  if (state.refCount > 0) return;

  for (const methodName of ["pushState", "replaceState"] as const) {
    if (win.history[methodName] === state.patched[methodName]) {
      win.history[methodName] = state.originals[methodName];
    }
  }
  patchedWindows.delete(win);
}
