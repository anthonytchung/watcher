import type {
  TmdbCandidate,
  TmdbMovieSearchResult,
  TmdbMultiSearchResponse,
  TmdbMultiSearchResult,
  TmdbTvSearchResult
} from "./types";

const DEFAULT_CANDIDATE_LIMIT = 5;

export function tmdbMultiSearchToCandidates(
  response: unknown,
  limit: number = DEFAULT_CANDIDATE_LIMIT
): TmdbCandidate[] {
  if (!isMultiSearchResponse(response)) {
    return [];
  }

  return response.results.filter(isMovieOrTvResult).filter((result) => result.adult !== true).slice(0, limit).map(toCandidate);
}

function isMultiSearchResponse(response: unknown): response is TmdbMultiSearchResponse {
  return Boolean(response && typeof response === "object" && Array.isArray((response as { results?: unknown }).results));
}

function isMovieOrTvResult(result: TmdbMultiSearchResult): result is TmdbMovieSearchResult | TmdbTvSearchResult {
  return isMovieResult(result) || isTvResult(result);
}

function isMovieResult(result: TmdbMultiSearchResult): result is TmdbMovieSearchResult {
  return result.media_type === "movie" && Number.isFinite(result.id) && typeof (result as TmdbMovieSearchResult).title === "string";
}

function isTvResult(result: TmdbMultiSearchResult): result is TmdbTvSearchResult {
  return result.media_type === "tv" && Number.isFinite(result.id) && typeof (result as TmdbTvSearchResult).name === "string";
}

function toCandidate(result: TmdbMovieSearchResult | TmdbTvSearchResult): TmdbCandidate {
  if (result.media_type === "movie") {
    return {
      actorNames: actorNamesFromCredits(result.credits),
      backdropPath: result.backdrop_path ?? null,
      mediaType: "movie",
      imdbId: validImdbId(result.external_ids?.imdb_id ?? result.imdb_id),
      networkNames: [],
      originalTitle: typeof result.original_title === "string" ? result.original_title : result.title,
      overview: result.overview ?? "",
      popularity: result.popularity ?? 0,
      posterPath: result.poster_path ?? null,
      productionCompanyNames: namesFromEntities(result.production_companies),
      releaseDate: result.release_date || null,
      title: result.title,
      tmdbId: result.id,
      voteAverage: result.vote_average ?? 0,
      voteCount: result.vote_count ?? 0,
      year: yearFromDate(result.release_date)
    };
  }

  return {
    actorNames: actorNamesFromCredits(result.credits),
    backdropPath: result.backdrop_path ?? null,
    mediaType: "tv",
    imdbId: validImdbId(result.external_ids?.imdb_id ?? result.imdb_id),
    networkNames: namesFromEntities(result.networks),
    originalTitle: typeof result.original_name === "string" ? result.original_name : result.name,
    overview: result.overview ?? "",
    popularity: result.popularity ?? 0,
    posterPath: result.poster_path ?? null,
    productionCompanyNames: namesFromEntities(result.production_companies),
    releaseDate: result.first_air_date || null,
    title: result.name,
    tmdbId: result.id,
    voteAverage: result.vote_average ?? 0,
    voteCount: result.vote_count ?? 0,
    year: yearFromDate(result.first_air_date)
  };
}

function validImdbId(value: string | null | undefined): string | null {
  return typeof value === "string" && /^tt\d{7,10}$/.test(value) ? value : null;
}

function yearFromDate(date: string | undefined): string | null {
  return date?.match(/^\d{4}/)?.[0] ?? null;
}

function actorNamesFromCredits(credits: TmdbMovieSearchResult["credits"]): string[] {
  if (!Array.isArray(credits?.cast)) return [];
  return (
    credits?.cast
      ?.slice()
      .sort((first, second) => (first.order ?? Number.MAX_SAFE_INTEGER) - (second.order ?? Number.MAX_SAFE_INTEGER))
      .map((castMember) => castMember.name.trim())
      .filter(Boolean)
      .slice(0, 12) ?? []
  );
}

function namesFromEntities(entities: TmdbMovieSearchResult["production_companies"]): string[] {
  return Array.isArray(entities)
    ? entities.filter((entity) => typeof entity?.name === "string").map((entity) => entity.name.trim()).filter(Boolean)
    : [];
}
