import type { WatcherTmdbMultiSearchResponse } from "../messages/tmdbMessages";
import { collectContextualMediaEvidence, selectContextualSearchTitle } from "../context/evidence";
import { buildStremioWebSearchUrl, buildStremioWebUrl } from "../stremio/links";
import type { ScoredTmdbCandidate } from "../tmdb/scoring";
import type { YouTubeVideoInfo } from "../youtube/types";
import { openStremioWebUrl } from "./stremioWebLauncher";
import { requestTmdbCandidates } from "./tmdbSearchClient";

const BUTTON_ROW_ID = "watcher-stremio-button-row";
const BUTTON_ID = "watcher-open-in-stremio";
const PANEL_ID = "watcher-stremio-panel";
const DESCRIPTION_LIMIT = 2_000;

let currentVideo: YouTubeVideoInfo | null = null;
let requestToken = 0;

export function renderOpenInStremioButton(video: YouTubeVideoInfo, doc: Document = document): boolean {
  const changedVideo = currentVideo?.videoId !== video.videoId;
  currentVideo = video;
  const row = getOrCreateButtonRow(doc);
  const button = getOrCreateButton(doc);
  if (changedVideo) {
    requestToken += 1;
    resetUi(row, button);
  }
  if (!row.contains(button)) row.prepend(button);
  return attachButtonRow(row, doc);
}

export function removeOpenInStremioButton(doc: Document = document): void {
  currentVideo = null;
  requestToken += 1;
  doc.getElementById(BUTTON_ROW_ID)?.remove();
}

function findTitleElement(doc: Document): Element | null {
  return doc.querySelector("ytd-watch-metadata h1") ?? doc.querySelector("h1.title") ?? doc.querySelector("#title h1");
}

function attachButtonRow(row: HTMLElement, doc: Document): boolean {
  const titleElement = findTitleElement(doc);
  if (titleElement) {
    if (titleElement.nextElementSibling !== row) titleElement.insertAdjacentElement("afterend", row);
    return true;
  }

  const metadataContainer = doc.querySelector("ytd-watch-metadata #above-the-fold")
    ?? doc.querySelector("ytd-watch-metadata")
    ?? doc.querySelector("#below");
  if (!metadataContainer) return false;

  const topRow = metadataContainer.querySelector("#top-row, #owner, #actions");
  if (topRow?.parentElement === metadataContainer) {
    if (topRow.previousElementSibling !== row) topRow.insertAdjacentElement("beforebegin", row);
    return true;
  }

  if (metadataContainer.firstElementChild !== row) metadataContainer.prepend(row);
  return true;
}

function getOrCreateButtonRow(doc: Document): HTMLElement {
  const existing = doc.getElementById(BUTTON_ROW_ID);
  if (existing) return existing;
  const row = doc.createElement("div");
  row.id = BUTTON_ROW_ID;
  return row;
}

function getOrCreateButton(doc: Document): HTMLButtonElement {
  const existing = doc.getElementById(BUTTON_ID);
  if (existing instanceof HTMLButtonElement) return existing;
  const button = doc.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.append(createTriggerLabel(doc, "Open in Stremio"));
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => void searchForCurrentVideo(button));
  return button;
}

function resetUi(row: HTMLElement, button: HTMLButtonElement): void {
  row.querySelector(`#${PANEL_ID}`)?.remove();
  setTriggerState(button, false, "Open in Stremio");
}

function setTriggerState(button: HTMLButtonElement, loading: boolean, label: string): void {
  button.disabled = loading;
  button.dataset.loading = String(loading);
  button.replaceChildren(createTriggerLabel(button.ownerDocument, label));
  button.setAttribute("aria-expanded", String(Boolean(button.parentElement?.querySelector(`#${PANEL_ID}`))));
}

function createTriggerLabel(doc: Document, label: string): HTMLElement {
  const wrapper = doc.createElement("span");
  wrapper.className = "watcher-trigger-label";
  const icon = doc.createElement("span");
  icon.className = "watcher-trigger-icon";
  icon.setAttribute("aria-hidden", "true");
  const text = doc.createElement("span");
  text.textContent = label;
  wrapper.append(icon, text);
  return wrapper;
}

async function searchForCurrentVideo(button: HTMLButtonElement): Promise<void> {
  const video = currentVideo;
  if (!video || button.disabled) return;
  const token = ++requestToken;
  const row = button.parentElement;
  if (!row) return;
  setTriggerState(button, true, "Finding this title...");
  button.setAttribute("aria-expanded", "true");
  renderLoading(row);
  const evidence = collectContextualMediaEvidence(video);
  const contextualSearchTitle = selectContextualSearchTitle(evidence);

  const response = await requestTmdbCandidates({
    alternativeQueries: evidence.probableTitles.slice(1, 4),
    channelName: video.channelName.slice(0, 200),
    cleanedTitle: contextualSearchTitle.slice(0, 200),
    contextualEvidence: {
      ...evidence,
      description: evidence.description?.slice(0, DESCRIPTION_LIMIT),
      transcriptExcerpts: evidence.transcriptExcerpts.map((excerpt) => excerpt.slice(0, 500)).slice(0, 3)
    },
    videoId: video.videoId,
    year: video.normalizedQuery.year,
    youtubeDescription: video.description.slice(0, DESCRIPTION_LIMIT),
    youtubeTitle: video.title.slice(0, 200)
  });

  if (token !== requestToken || currentVideo?.videoId !== video.videoId || !button.isConnected) return;
  setTriggerState(button, false, "Open in Stremio");
  button.setAttribute("aria-expanded", "true");
  renderSearchResponse(row, response, video);
}

function renderSearchResponse(row: HTMLElement, response: WatcherTmdbMultiSearchResponse, video: YouTubeVideoInfo): void {
  const panel = createPanel(row.ownerDocument);
  replacePanel(row, panel);

  if (!response.ok) {
    if (response.error.code === "TMDB_PROXY_NOT_CONFIGURED") {
      appendHeading(panel, "Automatic matching isn't set up");
      appendText(panel, "You can still search Stremio Web using the detected video title.", "status");
      appendManualSearch(panel, video.probableMediaTitle, false);
      panel.focus();
      return;
    }
    appendHeading(panel, "Search unavailable");
    appendText(panel, "The matching service could not be reached. You can still search by title.", "alert");
    appendManualSearch(panel, video.probableMediaTitle, false);
    appendRetry(panel);
    panel.focus();
    return;
  }

  const candidates = response.result.kind === "best_match" ? [response.result.candidate] : response.result.candidates;
  if (candidates.length === 0) {
    appendHeading(panel, "Couldn't identify this title");
    appendText(panel, "Try searching by movie or series name.", "status");
    appendManualSearch(panel, video.probableMediaTitle, false);
    panel.focus();
    return;
  }

  if (response.result.kind === "best_match") {
    appendHeading(panel, "Best match");
    appendFeaturedCandidate(panel, candidates[0], video);
  } else {
    appendHeading(panel, "Choose a match");
    appendText(panel, "A few titles look similar.", "status");
    appendCandidatePicker(panel, candidates, video);
  }
  appendManualSearch(panel, video.probableMediaTitle, true);
  panel.focus();
}

function appendFeaturedCandidate(panel: HTMLElement, scored: ScoredTmdbCandidate, video: YouTubeVideoInfo): void {
  const item = panel.ownerDocument.createElement("div");
  item.className = "watcher-featured-candidate";
  item.append(createPoster(panel.ownerDocument, scored));
  const content = createCandidateDetails(panel.ownerDocument, scored, true);
  const action = createPrimaryAction(panel, scored, video, scored.candidate.imdbId ? "Open in Stremio Web" : "Search Stremio Web");
  content.append(action);
  item.append(content);
  panel.append(item);
}

function appendCandidatePicker(panel: HTMLElement, candidates: ScoredTmdbCandidate[], video: YouTubeVideoInfo): void {
  const list = panel.ownerDocument.createElement("div");
  list.className = "watcher-candidate-list";
  let selected = candidates[0];
  const action = createPrimaryAction(panel, selected, video, "Open selected in Stremio Web");

  for (const [index, scored] of candidates.entries()) {
    const item = panel.ownerDocument.createElement("button");
    item.type = "button";
    item.className = "watcher-candidate";
    item.setAttribute("aria-pressed", String(index === 0));
    item.append(createPoster(panel.ownerDocument, scored), createCandidateDetails(panel.ownerDocument, scored, false));
    item.addEventListener("click", () => {
      selected = scored;
      for (const candidate of list.querySelectorAll(".watcher-candidate")) candidate.setAttribute("aria-pressed", String(candidate === item));
      action.onclick = () => launchCandidate(selected, video, panel);
      action.textContent = selected.candidate.imdbId ? "Open selected in Stremio Web" : "Search selected in Stremio Web";
    });
    list.append(item);
  }
  action.onclick = () => launchCandidate(selected, video, panel);
  panel.append(list, action);
}

function createCandidateDetails(doc: Document, scored: ScoredTmdbCandidate, featured: boolean): HTMLElement {
  const details = doc.createElement("div");
  details.className = "watcher-candidate-details";
  const title = doc.createElement("strong");
  title.textContent = scored.candidate.title;
  const metadata = doc.createElement("span");
  metadata.className = "watcher-candidate-metadata";
  metadata.textContent = [scored.candidate.year, scored.candidate.mediaType === "tv" ? "Series" : "Movie"].filter(Boolean).join(" · ");
  details.append(title, metadata);
  if (featured && scored.reasons[0]) {
    const reason = doc.createElement("span");
    reason.className = "watcher-match-reason";
    reason.textContent = scored.reasons[0];
    details.append(reason);
  }
  return details;
}

function createPoster(doc: Document, scored: ScoredTmdbCandidate): HTMLElement {
  const poster = doc.createElement("div");
  poster.className = "watcher-poster";
  poster.setAttribute("aria-hidden", "true");
  const placeholder = doc.createElement("span");
  placeholder.textContent = scored.candidate.mediaType === "tv" ? "Series" : "Movie";
  poster.append(placeholder);
  if (scored.candidate.posterPath?.startsWith("/")) {
    const image = doc.createElement("img");
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("load", () => poster.classList.add("has-image"));
    image.addEventListener("error", () => image.remove());
    image.src = `https://image.tmdb.org/t/p/w185${scored.candidate.posterPath}`;
    poster.append(image);
  }
  return poster;
}

function createPrimaryAction(
  panel: HTMLElement,
  scored: ScoredTmdbCandidate,
  video: YouTubeVideoInfo,
  label: string
): HTMLButtonElement {
  const action = panel.ownerDocument.createElement("button");
  action.type = "button";
  action.className = "watcher-primary-action";
  action.textContent = label;
  action.onclick = () => launchCandidate(scored, video, panel);
  return action;
}

function launchCandidate(scored: ScoredTmdbCandidate, video: YouTubeVideoInfo, panel: HTMLElement): void {
  void openGeneratedStremioWebUrl(buildStremioWebUrl({
    episode: video.normalizedQuery.episode,
    imdbId: scored.candidate.imdbId,
    mediaType: scored.candidate.mediaType,
    season: video.normalizedQuery.season,
    title: scored.candidate.title
  }), panel);
}

function appendRetry(panel: HTMLElement): void {
  const retry = panel.ownerDocument.createElement("button");
  retry.type = "button";
  retry.className = "watcher-secondary-action";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => panel.ownerDocument.getElementById(BUTTON_ID)?.click());
  panel.append(retry);
}

function appendManualSearch(panel: HTMLElement, initialTitle: string, collapsed: boolean): void {
  const container = panel.ownerDocument.createElement(collapsed ? "details" : "div");
  container.className = "watcher-manual-search-container";
  if (collapsed) {
    const summary = panel.ownerDocument.createElement("summary");
    summary.textContent = "Search manually";
    container.append(summary);
  }
  const form = panel.ownerDocument.createElement("form");
  form.className = "watcher-manual-search";
  const input = panel.ownerDocument.createElement("input");
  input.type = "search";
  input.value = initialTitle;
  input.maxLength = 160;
  input.setAttribute("aria-label", "Movie or series title");
  const button = panel.ownerDocument.createElement("button");
  button.type = "submit";
  button.className = "watcher-primary-action";
  button.textContent = "Search Stremio Web";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void openGeneratedStremioWebUrl(buildStremioWebSearchUrl(input.value), panel);
  });
  form.append(input, button);
  container.append(form);
  panel.append(container);
}

async function openGeneratedStremioWebUrl(url: string | null, panel: HTMLElement): Promise<void> {
  if (!url) {
    appendText(panel, "A valid Stremio Web URL could not be created.", "alert");
    return;
  }

  const response = await openStremioWebUrl(url);
  if (response.ok) {
    appendText(panel, "Opened Stremio Web in a new tab.", "status");
    return;
  }

  appendText(panel, "Stremio Web could not be opened in a new tab.", "alert");
}

function createPanel(doc: Document): HTMLElement {
  const panel = doc.createElement("section");
  panel.id = PANEL_ID;
  panel.tabIndex = -1;
  panel.setAttribute("aria-label", "Stremio match results");
  panel.setAttribute("role", "dialog");
  const close = doc.createElement("button");
  close.type = "button";
  close.className = "watcher-close-button";
  close.textContent = "×";
  close.title = "Close";
  close.setAttribute("aria-label", "Close Stremio results");
  panel.setAttribute("aria-live", "polite");
  close.addEventListener("click", () => closePanel(panel));
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePanel(panel);
  });
  panel.append(close);
  return panel;
}

function closePanel(panel: HTMLElement): void {
  requestToken += 1;
  const trigger = panel.ownerDocument.getElementById(BUTTON_ID);
  panel.remove();
  if (trigger instanceof HTMLButtonElement) {
    setTriggerState(trigger, false, "Open in Stremio");
    trigger.focus();
  }
}

function replacePanel(row: HTMLElement, panel: HTMLElement): void {
  row.querySelector(`#${PANEL_ID}`)?.remove();
  row.append(panel);
}

function renderLoading(row: HTMLElement): void {
  const panel = createPanel(row.ownerDocument);
  panel.classList.add("watcher-loading");
  const layout = row.ownerDocument.createElement("div");
  layout.className = "watcher-loading-layout";
  const poster = row.ownerDocument.createElement("div");
  poster.className = "watcher-loading-poster";
  const copy = row.ownerDocument.createElement("div");
  copy.className = "watcher-loading-copy";
  appendText(copy, "Checking for matches...", "status");
  layout.append(poster, copy);
  panel.append(layout);
  replacePanel(row, panel);
}

function appendHeading(parent: HTMLElement, text: string): void {
  const heading = parent.ownerDocument.createElement("h2");
  heading.textContent = text;
  parent.append(heading);
}

function appendText(parent: HTMLElement, text: string, role: "alert" | "status"): void {
  parent.querySelector(`[role="${role}"]`)?.remove();
  const element = parent.ownerDocument.createElement("p");
  element.setAttribute("role", role);
  element.textContent = text;
  parent.append(element);
}
