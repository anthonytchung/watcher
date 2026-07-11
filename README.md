# Watcher for YouTube

Watcher is a Chrome Manifest V3 extension that identifies the movie or television series associated with a YouTube watch page and helps the user open a verified candidate in Stremio Web.

The extension extracts page context, builds structured evidence, searches TMDb through a user-operated proxy, ranks movie and TV candidates, and shows the match before opening a normal browser tab. Title normalization is one signal in a broader contextual pipeline. Ambiguous results remain a picker. Missing IMDb IDs or missing TMDb configuration fall back to a Stremio Web title search.

Watcher does not find, scrape, host, download, or provide streams. Availability in Stremio Web depends on the user's Stremio account and installed add-ons or services.

## MVP Status

The extension builds, validates, and includes contextual evidence collection, media-level ranking, conservative episode-ranking interfaces, and the Stremio Web URL flow. It still requires a compatible TMDb proxy for structured matching because a public browser extension cannot safely contain a TMDb credential. Without that configuration, the UI explains that automatic matching is not set up and still offers an editable Stremio Web title search.

Real YouTube SPA behavior and live Stremio Web pages require the manual checks below; they are not fully covered by the jsdom unit tests.

## Architecture

```text
YouTube page
  -> content script: metadata, context evidence, navigation, UI, stale-request guard
  -> deterministic context extraction: titles, entities, scene, year, season, episode hints
  -> typed Chrome message
  -> MV3 service worker: validation, proxy request, cache, scoring
  -> contextual media ranking and conservative episode-ranking interfaces
  -> exact result, candidate picker, or search fallback
  -> explicit user click
  -> validated https://web.stremio.com tab
```

- `src/youtube/`: URL checks, metadata extraction, title normalization, structured year/season/episode hints.
- `src/context/`: evidence model, deterministic context extraction, and episode candidate ranking abstractions.
- `src/content/`: idempotent YouTube watcher and accessible inline match UI.
- `src/messages/`: shared message contracts.
- `src/background/`: request validation, TMDb proxy client, timeout, bounded cache, and scoring orchestration.
- `src/tmdb/`: validated response mapping and transparent candidate scoring.
- `src/stremio/`: IMDb validation and all Stremio Web URL construction.
- `tests/`: pure, network-boundary, DOM, metadata, and stale-navigation tests.

## Prerequisites

- Node.js 20 or newer
- npm (the committed `package-lock.json` is authoritative)
- Desktop Google Chrome or another Chromium browser that supports unpacked MV3 extensions
- A Stremio Web account for end-to-end detail-page and playback testing
- A TMDb API key or v4 read access token for automatic matching

## Install and Validate

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Run all checks with `npm run check`. For watch builds of both content and background entries, use `npm run dev`. To run the local TMDb proxy and the extension watch build together, use `npm run dev:with-proxy`.

## Configuration

Copy the safe placeholders and edit `.env`:

```bash
cp .env.example .env
```

```dotenv
VITE_TMDB_MULTI_SEARCH_PROXY_URL=http://localhost:8787/api/tmdb/multi-search
VITE_TMDB_CONFIDENCE_THRESHOLD=0.74

# Server-only values used by npm run proxy. Do not use a VITE_ prefix for secrets.
TMDB_READ_ACCESS_TOKEN=your_tmdb_v4_read_access_token
TMDB_API_KEY=
TMDB_PROXY_PORT=8787
TMDB_PROXY_ALLOWED_ORIGINS=
```

The extension reads only the `VITE_` values at build time. Anything prefixed with `VITE_` is inspectable in the built extension, so the proxy URL may be public but a TMDb API key or bearer token must never be placed in a `VITE_` variable.

The build derives one exact `host_permissions` origin from the proxy URL. HTTPS is required except for `http://localhost` and `http://127.0.0.1`. Rebuild and reload the extension whenever the proxy URL changes.

### Local TMDb Proxy

This repo includes a small local proxy so automatic matching can run without exposing your TMDb credential in the browser extension.

1. Copy the example environment file.

```bash
cp .env.example .env
```

2. Paste either your TMDb v4 read access token or v3 API key into `.env`.

```dotenv
TMDB_READ_ACCESS_TOKEN=your_tmdb_v4_read_access_token
TMDB_API_KEY=
```

Prefer `TMDB_READ_ACCESS_TOKEN` when available. Leave `TMDB_API_KEY` empty if you use the token.

3. Start the proxy.

```bash
npm run proxy
```

The proxy listens at `http://localhost:8787/api/tmdb/multi-search` by default. It loads `.env`, calls TMDb server-side, enriches the top movie/TV results with IMDb IDs, cast, networks, and production companies, and returns the response shape the extension already expects.

4. In another terminal, rebuild or watch the extension.

```bash
npm run build
```

or:

```bash
npm run dev
```

Then reload the unpacked extension in Chrome or Arc. You can also run the proxy and watcher together with:

```bash
npm run dev:with-proxy
```

The local proxy reflects CORS only for `chrome-extension://` origins, localhost origins, or exact origins listed in `TMDB_PROXY_ALLOWED_ORIGINS`. Use a comma-separated list for deployed proxy origins if you move this server elsewhere.

### Proxy Contract

The service worker sends only:

```text
GET <proxy-url>?query=<encoded-title>&include_adult=false&language=en-US
Accept: application/json
```

The included proxy authenticates to TMDb server-side, calls `/3/search/multi`, enriches the top movie and TV results with details, and returns a TMDb-compatible object containing `page` and `results`. Watcher accepts movies and TV results and ignores people and adult results.

For exact Stremio detail links, enrich each returned result with either:

```json
{
  "imdb_id": "tt1234567"
}
```

or:

```json
{
  "external_ids": { "imdb_id": "tt1234567" }
}
```

Optional `credits.cast`, `networks`, and `production_companies` fields improve actor and official-channel scoring. Raw TMDb multi-search does not include those fields, so the included proxy requests detail enrichment for the top results.

CORS should allow the deployed extension origin. Unpacked extension IDs can change; the local proxy allows extension origins for development, but a deployed proxy should use explicit allowed origins.

## Build and Load Unpacked

1. Configure `.env` if automatic matching is desired.
2. Start `npm run proxy` if using the included local TMDb proxy.
3. Run `npm run build`.
4. Open `chrome://extensions`.
5. Enable **Developer mode**.
6. Click **Load unpacked**.
7. Select this project's `dist/` directory.
8. Open a standard `https://www.youtube.com/watch?v=...` page.

After changes, rebuild and click the extension's reload control on `chrome://extensions`, then refresh the YouTube tab. The build generates `dist/content.js`, `dist/background.js`, and `dist/manifest.json`; no manual copying is required.

## Matching Behavior

Watcher first builds `ContextualMediaEvidence` from the current YouTube page. Implemented evidence sources are raw title, cleaned title, description, channel name, hashtags, chapter/timestamp lines, structured video URL metadata, video ID, publication date when available, probable titles, character-like names, actor-like names from cast language, quoted dialogue, scene descriptions, year hints, season hints, episode hints, and movie-versus-series hints.

Transcript extraction is not currently implemented. The evidence model has a bounded `transcriptExcerpts` field so a future best-effort extractor can add limited, relevant excerpts without persisting full transcripts. No LLM is currently used. The architecture keeps semantic extraction and LLM comparison as optional future stages, and all identifiers must still come from structured metadata services.

Normalization remains useful: it removes trailer, clip, scene, reaction, review, explanation, quality, subtitle, remaster, edit, interview, featurette, soundtrack, and compilation qualifiers while preserving years, meaningful subtitles, franchise names, and season/episode notation. Context extraction then adds title prefixes, quoted text, scene descriptions, entities, hashtags, chapters, and explicit season/episode hints.

Candidate scoring uses contextual probable titles and normalized title similarity, then release year, media type, cast/character evidence, channel/network or studio names, and season/episode notation. Popularity and vote count only break ties. Missing signals are not treated as negative evidence.

A candidate is presented as the likely match only when it reaches the configurable confidence threshold and leads the runner-up by at least `0.08`. Close or lower-confidence results show up to three choices. No results and network/configuration errors show a manual title field. A candidate without an IMDb ID opens an encoded Stremio Web search instead of constructing an invalid detail URL.

Episode matching is implemented as a clean interface in `src/context/episodeMatching.ts`, with lexical/entity ranking over a narrowed episode set. The extension does not yet fetch TMDb season episode lists in production, so exact episode matching is not live end-to-end. The ranking module intentionally falls back to the series page when a series is known but episode evidence is weak, shared by multiple episodes, or missing structured season/episode metadata.

Stremio Web URLs are centralized in `src/stremio/links.ts` and mirror Stremio Web's hash-router routes:

- Search: `https://web.stremio.com/#/search?search=<encoded-query>`
- Movie detail: `https://web.stremio.com/#/detail/movie/<imdb>`
- Series detail: `https://web.stremio.com/#/detail/series/<imdb>`
- Episode detail: `https://web.stremio.com/#/detail/series/<imdb>/<imdb>:<season>:<episode>`

The extension opens these URLs with `chrome.tabs.create` from the background service worker after an explicit user click. It does not navigate the current YouTube tab or call out to a native application.

## Privacy and Security

Watcher reads only the current watch page's video ID, title, description (up to 2,000 characters in extension messaging), channel name, and URL. Description, channel, and extracted evidence remain inside the extension and are used only for local scoring. Only the selected contextual search query leaves the browser for the configured proxy. Poster images, when available, are loaded from `image.tmdb.org` with a no-referrer policy.

The contextual evidence object is bounded before service-worker validation. Transcript excerpts are currently empty; future transcript support should send only limited relevant excerpts when contextual matching needs them and must not persist complete transcripts.

No analytics or permanent viewing-history store exists. A service-worker memory cache holds up to 50 query results and disappears when Chrome suspends the worker. The extension contains no TMDb secret, uses no remote code or dynamic evaluation, validates runtime messages and proxy responses, and permits only generated `https://web.stremio.com` detail/search routes.

Final extension permissions are empty. Content-script page access is restricted to standard YouTube watch URLs. Host permission is empty without a proxy and limited to the configured proxy origin when present.

## Manual Test Checklist

1. Remove any previous unpacked copy, run `npm ci && npm run build`, and load `dist/`.
2. Open a YouTube watch URL directly; confirm one **Open in Stremio** control appears near the title.
3. Navigate from the YouTube homepage to a watch page without reloading.
4. Move rapidly between several videos; confirm old titles/results never appear on the current video.
5. Use browser Back and Forward and confirm the control resets and reattaches.
6. Test an obvious official movie trailer and verify the likely match before opening.
7. Test a noisy movie clip with actor names in its description.
8. Test an original/remake pair with a release year and verify the correct year ranks first.
9. Test a television-series clip and verify it is labeled **Series**.
10. Test a season trailer and preserve the season number.
11. Test an `SxxExx` video and inspect the generated episode destination after choosing it.
12. Test a scene-style title such as `Show Name: Character Does Something` and verify the show prefix is searched instead of the whole scene description.
13. Test a character-only series clip and verify exact episode identification is not claimed unless structured episode evidence supports it.
14. Test an ambiguous shared title and verify a picker appears instead of an automatic launch.
15. Test a nonsense/no-match title and use manual correction.
16. Make the proxy unavailable and verify the error plus retry/manual search states.
17. Build without `.env` and verify the missing-configuration message, empty proxy host permission, editable title, and **Search Stremio Web** fallback.
18. Check readability in YouTube light and dark themes.
19. Navigate the control, candidates, input, and actions using Tab, Shift+Tab, Enter, and Space.
20. Test two YouTube tabs independently.
21. Navigate through a playlist and confirm each video resets matching state.
22. Click fallback search and confirm a new browser tab opens `https://web.stremio.com/#/search?search=...` while the YouTube tab remains unchanged.
23. With TMDb configured and enriched with IMDb IDs, verify movie and series candidates open the expected Stremio Web detail URL in a new tab.
24. Inspect loading, movie, series, ambiguous, no-match, and technical-error states at narrow width and common zoom levels.
25. Verify a long title wraps, a missing poster shows a neutral placeholder, Escape dismisses the panel, and focus rings remain visible.

## Troubleshooting

- **No button:** only standard `/watch?v=...` pages are supported. Reload the extension and YouTube tab after rebuilding.
- **Proxy not configured:** create `.env`, keep `VITE_TMDB_MULTI_SEARCH_PROXY_URL=http://localhost:8787/api/tmdb/multi-search`, rebuild, and reload the unpacked extension.
- **Proxy says credential is not configured:** paste `TMDB_READ_ACCESS_TOKEN` or `TMDB_API_KEY` into `.env`, then restart `npm run proxy`.
- **Network error:** verify `npm run proxy` is still running, verify HTTPS for non-local proxies, check CORS for the current extension origin, and inspect the generated `dist/manifest.json` host permission.
- **Candidates only search by title:** enrich proxy results with a valid IMDb external ID.
- **No Stremio Web tab opens:** reload the extension, inspect the service worker console, and verify the generated URL starts with `https://web.stremio.com/#/`.

## Current Limitations

- Shorts and embedded players are intentionally unsupported.
- Localization is best-effort; deterministic qualifier rules cannot cover every language.
- Exact IMDb IDs and richer cast/network scoring depend on proxy enrichment.
- Production episode retrieval from TMDb seasons is not yet wired into the background flow.
- Transcript extraction is planned but currently unsupported.
- LLM or embedding-based semantic matching is planned as an optional abstraction, not used now.
- Cache is intentionally temporary and service-worker-local.
- There is no LLM fallback, analytics, backend implementation, Stremio add-on, or stream discovery.
- Stremio Web detail pages and actual playback still require manual account/add-on environment testing.
