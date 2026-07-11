export type TmdbCandidateMediaType = "movie" | "tv";

export interface TmdbMultiSearchResponse {
  page: number;
  results: TmdbMultiSearchResult[];
  total_pages: number;
  total_results: number;
}

export interface TmdbApiErrorResponse {
  success: false;
  status_code: number;
  status_message: string;
}

export type TmdbMultiSearchResult =
  | TmdbMovieSearchResult
  | TmdbTvSearchResult
  | TmdbPersonSearchResult
  | TmdbUnknownSearchResult;

export interface TmdbSearchResultBase {
  adult?: boolean;
  backdrop_path?: string | null;
  credits?: TmdbCreditsResponse;
  genre_ids?: number[];
  id: number;
  external_ids?: TmdbExternalIds;
  imdb_id?: string | null;
  media_type: string;
  original_language?: string;
  overview?: string;
  popularity?: number;
  poster_path?: string | null;
  production_companies?: TmdbNamedEntity[];
  vote_average?: number;
  vote_count?: number;
}

export interface TmdbExternalIds {
  imdb_id?: string | null;
}

export interface TmdbMovieSearchResult extends TmdbSearchResultBase {
  media_type: "movie";
  original_title: string;
  release_date?: string;
  title: string;
  video?: boolean;
}

export interface TmdbTvSearchResult extends TmdbSearchResultBase {
  created_by?: TmdbNamedEntity[];
  media_type: "tv";
  first_air_date?: string;
  name: string;
  networks?: TmdbNamedEntity[];
  origin_country?: string[];
  original_name: string;
}

export interface TmdbNamedEntity {
  id?: number;
  name: string;
}

export interface TmdbCreditsResponse {
  cast?: TmdbCastMember[];
  crew?: TmdbCrewMember[];
}

export interface TmdbCastMember {
  adult?: boolean;
  cast_id?: number;
  character?: string;
  credit_id?: string;
  id: number;
  known_for_department?: string;
  name: string;
  order?: number;
  original_name?: string;
  popularity?: number;
  profile_path?: string | null;
}

export interface TmdbCrewMember {
  adult?: boolean;
  credit_id?: string;
  department?: string;
  id: number;
  job?: string;
  known_for_department?: string;
  name: string;
  original_name?: string;
  popularity?: number;
  profile_path?: string | null;
}

export interface TmdbPersonSearchResult {
  adult?: boolean;
  id: number;
  known_for?: Array<TmdbMovieSearchResult | TmdbTvSearchResult | TmdbUnknownSearchResult>;
  known_for_department?: string;
  media_type: "person";
  name: string;
  popularity?: number;
  profile_path?: string | null;
}

export interface TmdbUnknownSearchResult {
  id: number;
  media_type: string;
  [key: string]: unknown;
}

export interface TmdbCandidate {
  actorNames: string[];
  backdropPath: string | null;
  mediaType: TmdbCandidateMediaType;
  imdbId: string | null;
  networkNames: string[];
  originalTitle: string;
  overview: string;
  popularity: number;
  posterPath: string | null;
  productionCompanyNames: string[];
  releaseDate: string | null;
  title: string;
  tmdbId: number;
  voteAverage: number;
  voteCount: number;
  year: string | null;
}

export interface TmdbCandidateSearchResponse {
  candidates: TmdbCandidate[];
  query: string;
  source: "tmdb";
}
