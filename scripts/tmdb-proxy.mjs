import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_PORT = 8787;
const DEFAULT_PATH = "/api/tmdb/multi-search";
const DEFAULT_LANGUAGE = "en-US";
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_CACHE_LIMIT = 100;
const DEFAULT_ENRICH_LIMIT = 5;
const MAX_QUERY_LENGTH = 160;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const cache = new Map();

loadEnvFile();

export function startProxyServer(options = {}) {
  const port = Number(options.port ?? process.env.TMDB_PROXY_PORT ?? DEFAULT_PORT);
  const routePath = options.routePath ?? DEFAULT_PATH;
  const server = createServer((request, response) => {
    handleRequest(request, response, { routePath }).catch((error) => {
      console.error(error);
      sendJson(response, 500, { message: "TMDb proxy failed." }, request);
    });
  });

  server.listen(port, () => {
    console.log(`TMDb proxy listening on http://localhost:${port}${routePath}`);
  });

  return server;
}

export async function handleRequest(request, response, options = {}) {
  if (request.method === "OPTIONS") {
    setCorsHeaders(response, request);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { message: "Method not allowed." }, request);
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== (options.routePath ?? DEFAULT_PATH)) {
    sendJson(response, 404, { message: "Not found." }, request);
    return;
  }

  const query = url.searchParams.get("query")?.trim() ?? "";
  if (!query) {
    sendJson(response, 400, { message: "Missing query." }, request);
    return;
  }

  if (query.length > MAX_QUERY_LENGTH) {
    sendJson(response, 400, { message: `Query must be ${MAX_QUERY_LENGTH} characters or fewer.` }, request);
    return;
  }

  if (!hasTmdbCredential()) {
    sendJson(response, 500, { message: "TMDb credential is not configured on the proxy." }, request);
    return;
  }

  const language = url.searchParams.get("language")?.trim() || DEFAULT_LANGUAGE;
  const includeAdult = url.searchParams.get("include_adult") === "true";
  const cacheKey = `${query}\u0000${language}\u0000${includeAdult}`;
  const cached = readCache(cacheKey);
  if (cached) {
    sendJson(response, 200, cached, request);
    return;
  }

  const payload = await searchAndEnrich(query, { includeAdult, language });
  writeCache(cacheKey, payload);
  sendJson(response, 200, payload, request);
}

export async function searchAndEnrich(query, options = {}) {
  const language = options.language ?? DEFAULT_LANGUAGE;
  const includeAdult = options.includeAdult === true;
  const searchUrl = new URL(`${TMDB_BASE_URL}/search/multi`);
  searchUrl.searchParams.set("query", query);
  searchUrl.searchParams.set("include_adult", String(includeAdult));
  searchUrl.searchParams.set("language", language);

  if (!process.env.TMDB_READ_ACCESS_TOKEN?.trim()) {
    searchUrl.searchParams.set("api_key", process.env.TMDB_API_KEY?.trim() ?? "");
  }

  const searchPayload = await tmdbJson(searchUrl);
  const results = Array.isArray(searchPayload.results) ? searchPayload.results : [];
  const enrichLimit = Number(process.env.TMDB_PROXY_ENRICH_LIMIT ?? DEFAULT_ENRICH_LIMIT);
  const enrichedResults = await Promise.all(results.map((result, index) => enrichResult(result, { index, language, enrichLimit })));

  return {
    ...searchPayload,
    results: enrichedResults
  };
}

async function enrichResult(result, options) {
  if (!isMovieOrTv(result) || options.index >= options.enrichLimit) return result;

  const detailUrl = new URL(`${TMDB_BASE_URL}/${result.media_type}/${result.id}`);
  detailUrl.searchParams.set("append_to_response", "external_ids,credits");
  detailUrl.searchParams.set("language", options.language);

  if (!process.env.TMDB_READ_ACCESS_TOKEN?.trim()) {
    detailUrl.searchParams.set("api_key", process.env.TMDB_API_KEY?.trim() ?? "");
  }

  try {
    const details = await tmdbJson(detailUrl);
    return {
      ...result,
      credits: details.credits,
      external_ids: details.external_ids,
      imdb_id: details.imdb_id ?? details.external_ids?.imdb_id ?? result.imdb_id ?? null,
      networks: details.networks ?? result.networks,
      production_companies: details.production_companies ?? result.production_companies
    };
  } catch (error) {
    console.warn(`TMDb detail enrichment failed for ${result.media_type}/${result.id}: ${error.message}`);
    return result;
  }
}

async function tmdbJson(url) {
  const headers = { Accept: "application/json" };
  const token = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers });
  const payload = await safeJson(response);
  if (!response.ok) {
    const message = payload?.status_message ?? payload?.message ?? `TMDb request failed with HTTP ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isMovieOrTv(result) {
  return result && typeof result === "object" && (result.media_type === "movie" || result.media_type === "tv") && Number.isFinite(result.id);
}

function hasTmdbCredential() {
  return Boolean(process.env.TMDB_READ_ACCESS_TOKEN?.trim() || process.env.TMDB_API_KEY?.trim());
}

function loadEnvFile() {
  const envPath = resolve(process.cwd(), ".env");
  let content;

  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function unquoteEnvValue(value) {
  const singleQuoted = value.startsWith("'") && value.endsWith("'");
  const doubleQuoted = value.startsWith("\"") && value.endsWith("\"");
  return singleQuoted || doubleQuoted ? value.slice(1, -1) : value;
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.payload;
}

function writeCache(key, payload) {
  cache.set(key, {
    expiresAt: Date.now() + Number(process.env.TMDB_PROXY_CACHE_TTL_MS ?? DEFAULT_CACHE_TTL_MS),
    payload
  });

  while (cache.size > Number(process.env.TMDB_PROXY_CACHE_LIMIT ?? DEFAULT_CACHE_LIMIT)) {
    cache.delete(cache.keys().next().value);
  }
}

function sendJson(response, status, payload, request) {
  setCorsHeaders(response, request);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function setCorsHeaders(response, request) {
  const origin = request.headers.origin;
  const allowedOrigin = allowedCorsOrigin(origin);
  if (!allowedOrigin) return;

  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
  response.setHeader("Vary", "Origin");
}

function allowedCorsOrigin(origin) {
  if (!origin) return null;

  const configured = (process.env.TMDB_PROXY_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured.includes("*") || configured.includes(origin)) return origin;
  if (origin.startsWith("chrome-extension://")) return origin;

  try {
    const url = new URL(origin);
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return isLocalhost ? origin : null;
  } catch {
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startProxyServer();
}
