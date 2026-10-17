# Russian Cinema for Nuvio

One playback-source plugin combining **Filmix** and **Seasonvar**, with Russian-language movies and series. Both sources run directly inside Nuvio; no PC resolver or hosted scraping service is added.

## Install

Add this repository manifest in Nuvio's plugin settings, refresh and enable **Russian Cinema**:

```text
https://raw.githubusercontent.com/kratoskrator/russian-cinema-nuvio/main/manifest.json
```

Choose a movie or episode in Nuvio. The source list identifies Filmix or Seasonvar and the available voiceover. This plugin supplies playback sources; it does not add the websites' homepage catalogs to Nuvio.

## Sources

| Source | Content | Current behavior |
| --- | --- | --- |
| Filmix | Movies and series | Public guest API, up to 480p; exact title/year/type matching and requested season/episode. Higher account-only qualities are excluded because the guest CDN may return short previews for those URLs. |
| Seasonvar | Series | Exact show, season and episode matching; up to four voiceovers, available quality variants and Russian subtitles when listed. |

The sources are queried independently. A failed Filmix request does not discard Seasonvar results, and vice versa. A source is returned only after an HLS playlist check or a 64-byte MP4 range check. Video segments and full video files are not downloaded during source lookup.

Filmix currently publishes the working guest API at `http://filmixapp.cyou/api/v2`. Public title searches and random temporary client identifiers use this unencrypted HTTP endpoint. No account token, password, site cookie or TMDB key is sent there. This release does not offer Filmix account login or premium playback. The HTTPS website is at https://filmix.gg/; its anonymous player endpoint rejected requests during development.

Seasonvar currently uses https://seasonvar.ru/. Its address can be changed in plugin settings if the website moves. Both services and their media hosts can change or restrict access by network.

## Metadata

Nuvio supplies TMDB identifiers to the plugin. Russian Cinema uses TMDB's Russian title, original title, release year and IMDb identifier to match the work.

Nuvio's injected `TMDB_API_KEY` is used when available. Otherwise enter your own TMDB v3 API key or API Read Access Token in the provider settings. Tokens remain separate from Filmix, Seasonvar and media-host requests. Never put a private key into a public source bundle.

## Verification

On **17 October 2026**, all **63 automated tests passed**, covering source matching, episode selection, independent failures, decoding, credential-safe logging, byte limits, request retries and MP4/HLS verification.

The final bundle passed **13 checks in Nuvio TV's QuickJS engine**, with the exact fetch polyfill, 32 MiB memory and 512 KiB stack: nine synthetic cases, three full replays of captured live responses and one real-response fallback case. Cases include both providers together, each provider blocked independently, missing metadata credentials and invalid video responses.

Separate ordinary network checks used Nuvio's official TV networking service on Windows. The final bundle was replayed against those captured responses after the last subtitle/URL-decoding changes:

| Title | Result |
| --- | --- |
| Interstellar | Two Filmix voiceovers at 480p |
| Breaking Bad S1E1 | Four Filmix and four Seasonvar voiceovers |
| Breaking Bad S2E1 | Four Filmix and four Seasonvar voiceovers; correct later season |

All returned MP4 URLs passed 64-byte HTTP 206 and MP4-header checks. A Russian subtitle response also returned valid WEBVTT. A separate Seasonvar test with Кухня verified Cyrillic title search.

The runtime uses ES5-style Promise code without Node, browser DOM, downloaded-script execution, CAPTCHA solving or external runtime packages. Response limits match the TV's 1 MiB quota. A 50-second lookup deadline bounds follow-up requests; in-flight requests in TV sandboxes without timers depend on Nuvio's native timeout.

Nuvio TV's current native network bridge maps HEAD to GET. MP4 verification therefore requests only bytes 0–63 and accepts a matching HTTP 206 response with a valid MP4 header. Hosts that ignore Range or return an HTML error are excluded. Native redirects are handled by Nuvio; this plugin never manually forwards site cookies.

**Physical playback on a Samsung TV is unverified.** Engine and network checks on a PC cannot prove device codec support, playback behavior or access from your network. TMDB authentication was tested with synthetic credentials; live source checks use known metadata fixtures rather than a private API key.

## Source and development

Download [source.zip](./source.zip) for editable source, tests and build tooling. Node.js 18 or later is sufficient; no dependency installation is needed.

```text
npm test
npm run build
```

The root `manifest.json` references `russian-cinema.js`. Publish them together after rebuilding. The source archive contains synthetic test responses; captured live pages, signed playback URLs and local scratch files are excluded.

## Credits

MIT licensed. Public protocol references are acknowledged in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). Russian Cinema is independent of Nuvio, Filmix, Seasonvar and TMDB.
