import { handleRuntimeMessage } from "./messages";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const pendingResponse = handleRuntimeMessage(message, sender.url);

  if (!pendingResponse) {
    return false;
  }

  pendingResponse
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        error: {
          code: "WATCHER_BACKGROUND_ERROR",
          message: error instanceof Error ? error.message : "Background request failed."
        },
        ok: false
      });
    });

  return true;
});
