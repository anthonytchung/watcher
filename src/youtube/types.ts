export interface YouTubeVideoInfo {
  videoId: string;
  title: string;
  probableMediaTitle: string;
  rawTitle: string;
  description: string;
  channelName: string;
  url: string;
  normalizedQuery: NormalizedMediaQuery;
  publishedAt?: string;
}

export interface NormalizedMediaQuery {
  alternativeQueries: string[];
  episode?: number;
  mediaTypeHint?: "movie" | "series";
  probableTitle: string;
  rawTitle: string;
  removedQualifiers: string[];
  season?: number;
  year?: number;
}
