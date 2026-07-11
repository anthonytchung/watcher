export interface StremioLinkInput {
  episode?: number;
  imdbId?: string | null;
  mediaType: "movie" | "tv";
  season?: number;
  title: string;
}

const IMDB_ID_PATTERN = /^tt\d{7,10}$/;
const STREMIO_WEB_ORIGIN = "https://web.stremio.com";

export function isValidImdbId(value: string | null | undefined): value is string {
  return typeof value === "string" && IMDB_ID_PATTERN.test(value);
}

export function buildStremioWebUrl(input: StremioLinkInput): string | null {
  return buildStremioWebDetailUrl(input) ?? buildStremioWebSearchUrl(input.title);
}

export function buildStremioWebDetailUrl(input: Omit<StremioLinkInput, "title">): string | null {
  if (!isValidImdbId(input.imdbId)) return null;
  if (input.mediaType === "movie") {
    return `${STREMIO_WEB_ORIGIN}/#/detail/movie/${input.imdbId}`;
  }

  const seriesUrl = `${STREMIO_WEB_ORIGIN}/#/detail/series/${input.imdbId}`;
  if (!validPositiveInteger(input.season) || !validPositiveInteger(input.episode)) return seriesUrl;

  return `${seriesUrl}/${input.imdbId}:${input.season}:${input.episode}`;
}

export function buildStremioWebSearchUrl(title: string): string | null {
  const query = title.trim();
  return query ? `${STREMIO_WEB_ORIGIN}/#/search?search=${encodeURIComponent(query)}` : null;
}

export function isStremioWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.origin !== STREMIO_WEB_ORIGIN || url.pathname !== "/") return false;
    if (url.hash.startsWith("#/search?")) {
      const params = new URLSearchParams(url.hash.slice("#/search?".length));
      return Boolean(params.get("search")?.trim()) && [...params.keys()].every((key) => key === "search");
    }

    const parts = url.hash.slice(2).split("/");
    if (parts[0] !== "detail") return false;
    const [, mediaType, imdbId, videoId] = parts;
    if ((mediaType !== "movie" && mediaType !== "series") || !isValidImdbId(imdbId)) return false;
    if (mediaType === "movie") return parts.length === 3;
    return parts.length === 3 || (parts.length === 4 && isValidEpisodeId(videoId, imdbId));
  } catch {
    return false;
  }
}

function validPositiveInteger(value: number | undefined): value is number {
  return Number.isInteger(value) && (value ?? 0) > 0;
}

function isValidEpisodeId(value: string | undefined, imdbId: string): boolean {
  if (!value) return false;
  const [episodeImdbId, season, episode] = value.split(":");
  return (
    episodeImdbId === imdbId &&
    /^\d+$/.test(season) &&
    /^\d+$/.test(episode) &&
    Number(season) > 0 &&
    Number(episode) > 0
  );
}
