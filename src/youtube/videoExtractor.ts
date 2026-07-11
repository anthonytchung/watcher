import { cleanTitle, normalizeMediaQuery } from "./titleCleaner";
import type { YouTubeVideoInfo } from "./types";

const VISIBLE_TITLE_SELECTORS = [
  "ytd-watch-metadata h1 yt-formatted-string",
  "ytd-watch-metadata h1",
  "h1.title"
];

const METADATA_TITLE_SELECTORS = [
  "meta[property='og:title']",
  "meta[name='title']"
];

const DESCRIPTION_SELECTORS = [
  "ytd-watch-metadata #description-inline-expander yt-attributed-string",
  "ytd-watch-metadata #description-inline-expander",
  "#description yt-formatted-string",
  "meta[name='description']",
  "meta[property='og:description']"
];

const CHANNEL_SELECTORS = [
  "ytd-watch-metadata ytd-channel-name a",
  "#owner ytd-channel-name a",
  "#upload-info #channel-name a",
  "#channel-name a"
];

export function isYouTubeWatchPage(href: string): boolean {
  const url = toUrl(href);

  if (!url) {
    return false;
  }

  return isYouTubeHost(url.hostname) && url.pathname === "/watch" && Boolean(url.searchParams.get("v"));
}

export function extractCurrentVideo(doc: Document = document, href: string = window.location.href): YouTubeVideoInfo | null {
  const videoId = extractVideoIdFromUrl(href);

  if (!videoId) {
    return null;
  }

  const metadataVideoId = readMetadataVideoId(doc);
  const visibleRawTitle = readTextFromSelectors(doc, VISIBLE_TITLE_SELECTORS);
  const metadataLooksStale = Boolean(metadataVideoId && metadataVideoId !== videoId);
  if (metadataLooksStale && !visibleRawTitle) return null;

  const rawTitle = visibleRawTitle || readTextFromSelectors(doc, METADATA_TITLE_SELECTORS) || doc.title;
  const title = cleanTitle(rawTitle);
  const normalizedQuery = normalizeMediaQuery(title);

  if (!title) {
    return null;
  }

  return {
    videoId,
    title,
    probableMediaTitle: normalizedQuery.probableTitle,
    rawTitle: normalizeMetadataText(rawTitle),
    description: readTextFromSelectors(doc, DESCRIPTION_SELECTORS),
    channelName: readTextFromSelectors(doc, CHANNEL_SELECTORS) || readChannelNameFromJsonLd(doc),
    publishedAt: readTextFromSelectors(doc, ["meta[itemprop='uploadDate']", "meta[itemprop='datePublished']"]) || undefined,
    url: canonicalWatchUrl(videoId),
    normalizedQuery
  };
}

function readMetadataVideoId(doc: Document): string {
  const direct = doc.querySelector("meta[itemprop='videoId']")?.getAttribute("content")?.trim();
  if (direct) return direct;
  const canonical = doc.querySelector("link[rel='canonical']")?.getAttribute("href");
  return canonical ? extractVideoIdFromUrl(canonical) ?? "" : "";
}

export function extractVideoIdFromUrl(href: string): string | null {
  const url = toUrl(href);

  if (!url || !isYouTubeHost(url.hostname)) {
    return null;
  }

  const videoId = url.searchParams.get("v");

  return videoId?.trim() || null;
}

export function canonicalWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function readTextFromSelectors(doc: Document, selectors: string[]): string {
  for (const selector of selectors) {
    const element = doc.querySelector(selector);
    const value = readElementValue(element);

    if (value) {
      return value;
    }
  }

  return "";
}

function readElementValue(element: Element | null): string {
  if (!element) {
    return "";
  }

  const content = element.getAttribute("content") ?? element.getAttribute("title") ?? element.textContent ?? "";

  return normalizeMetadataText(content);
}

function normalizeMetadataText(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readChannelNameFromJsonLd(doc: Document): string {
  const scripts = doc.querySelectorAll("script[type='application/ld+json']");

  for (const script of scripts) {
    const text = script.textContent;

    if (!text) {
      continue;
    }

    try {
      const parsed: unknown = JSON.parse(text);
      const name = findJsonLdAuthorName(parsed);

      if (typeof name === "string" && name.trim()) {
        return normalizeMetadataText(name);
      }
    } catch {
      continue;
    }
  }

  return "";
}

function findJsonLdAuthorName(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = findJsonLdAuthorName(item);
      if (name) return name;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const object = value as { "@graph"?: unknown; author?: unknown };
  if (object.author && typeof object.author === "object") {
    const name = (object.author as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name;
  }
  return findJsonLdAuthorName(object["@graph"]);
}

function toUrl(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

function isYouTubeHost(hostname: string): boolean {
  return hostname === "youtube.com" || hostname.endsWith(".youtube.com");
}
