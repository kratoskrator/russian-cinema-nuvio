# Russian Cinema for Nuvio

One playback-source plugin for Russian-language movies and series. Version **1.1.1** combines **Filmix, Seasonvar and Collaps**, with optional **KinoPub and HDVB** account access. It runs inside Nuvio without a PC resolver or hosted scraping service.

## Install or update

Add this manifest in Nuvio's plugin settings, refresh and enable **Russian Cinema**:

```text
https://raw.githubusercontent.com/kratoskrator/russian-cinema-nuvio/main/manifest.json
```

Existing users can refresh the same manifest to install version 1.1.1. Choose a movie or episode in Nuvio; the source list identifies the provider, available resolution, voiceover and codecs. This plugin supplies playback sources, not the websites' homepage catalogs.

**No provider account is required for the default sources.** All account fields are empty by default. Collaps adds 1080p DASH when available; it does not promise 4K.

## Sources

| Source | Content | Behavior |
| --- | --- | --- |
| Filmix guest | Movies and series | Public guest API, up to 480p. Higher anonymous links are excluded because some resolve to short previews. |
| Seasonvar | Series | Exact show, season and episode; up to four voiceovers, available qualities and subtitles. On 26 October its public site returned a maintenance message, so it supplied no live sources. |
| Collaps | Movies and series | Public IMDb player. Live checks found 1080p VP9/AV1 DASH and 720p H.264 HLS. Preserves published audio and subtitle labels. |
| KinoPub account, optional | Movies and series | Your own authorized access token. Up to three account-issued variants, potentially 2160p when the selected file and your account allow it. |
| HDVB partner API, optional | Movies and series | Your own approved partner key. Resolves the requested episode and voiceover; actual HLS resolution is read from the playlist. |

Providers and media checks run independently. Once a verified 1080p-or-higher choice and an HLS/MP4 choice are ready, the plugin returns the choices already verified and cancels remaining requests. A slow or unavailable alternative no longer holds up the whole source list. The number of voiceovers and alternative codecs can vary with response timing. If account credentials are configured, those account providers finish before this early return so their higher-quality choices are preserved. If no HD source succeeds, the lookup returns all usable completed choices. Missing episodes never fall back to a different episode. Account adapters make no requests when their credentials are blank.

## Optional account settings

Enter credentials only in Russian Cinema's Nuvio settings. No provider credentials are bundled, and ordinary playback requests do not carry account authorization headers.

- **KinoPub:** supply your own current API access token. The API origin defaults to `https://api.srvkp.com`; only HTTPS origins are accepted. Expired tokens must be replaced by the account owner. The plugin requests links only for the selected movie or episode. It deliberately does not prefetch KinoPub media URLs during lookup because doing so can start paid viewing sessions; resolution and codecs come from the selected account API file metadata.
- **HDVB:** supply an approved partner API key. HDVB partner access is separate from an ordinary viewer account. The API origin defaults to `https://apivb.com` and requires HTTPS.

Authenticated playback has been tested with synthetic responses only. No subscriber or partner credentials were available for a live account test. Account adapters do not bypass subscriptions, partner approval or content restrictions.

Filmix Pro/Pro+ is **unavailable in this TV release**. The mobile guest API is HTTP and is never used with account credentials. A separately implemented FilmixTV HLS adapter requires a paired device hash, but Nuvio's current native network bridge can forward that custom header across redirects. Its account branch is therefore disabled before sending credentials; there are no FilmixTV login fields in the published settings. A future internal client may enable it only after providing safe redirect handling. Its fixture tests include exact episode selection and full-duration HLS checks to reject previews. It does not accept mobile Pro device tokens.

## Metadata and networking

Nuvio supplies TMDB identifiers. The plugin uses TMDB's Russian title, original title, release year and IMDb identifier to identify the work.

Nuvio's injected `TMDB_API_KEY` is used when available. Otherwise enter your own TMDB v3 API key or API Read Access Token in plugin settings. TMDB credentials are kept separate from source and media requests. Never put a private credential into a public bundle.

Filmix's working guest API is currently `http://filmixapp.cyou/api/v2`. Public searches and temporary random client identifiers use this unencrypted endpoint. No account token, password, cookie, device hash or TMDB key is sent there.

Seasonvar defaults to `https://seasonvar.ru`; Collaps defaults to `https://api.luxembd.ws`. Their HTTPS origins can be updated in settings if they move. Access can vary by network, title and media host. HTTP 403, browser verification and short maintenance responses are skipped without repeated same-origin searches; verification scripts are not executed or solved. Seasonvar's maintenance is a website outage, which a plugin update cannot restore.

The runtime uses ES5-style Promise code without Node, DOM, downloaded-script execution or runtime packages. Responses are bounded by the TV's 1 MiB quota, with a 50-second overall lookup budget. In-flight requests in sandboxes without timers depend on Nuvio's native timeout.

## Verification and TV compatibility

On **26 October 2026**, all **130 automated tests passed**, covering exact matching and episode selection, optional account flows, preview rejection, credential isolation, independent failures, size limits, decoding and media verification. New regression tests cover stalled providers, a stalled alternate manifest, cancellation without guest timers, preservation of pending HD/account choices and maintenance pages.

HLS and DASH sources are checked against real playlist/manifest structure. Resolution and codec declarations are read when present. Protected DASH and DRM-specific HLS are excluded. MP4 checks request bytes 0–63 and require a matching HTTP 206 response and MP4 header; Nuvio TV's native bridge maps HEAD to GET, so HEAD is not used. Video segments and full video files are not downloaded during source lookup. KinoPub uses the account API metadata exception described above.

The bundle passed **21 fixture checks** in Nuvio TV's QuickJS engine with its exact fetch polyfill, 32 MiB memory and 512 KiB stack. The worker and networking service were freshly retrieved on 26 October. Three live checks used that engine and Nuvio's official TV networking service on Windows:

| Title | Result without accounts |
| --- | --- |
| Interstellar | Two Filmix 480p choices, one Collaps DASH 1080p and one HLS 720p; 0.88 seconds |
| The Shawshank Redemption | Collaps DASH 1080p and HLS 720p; unavailable Filmix HTTP 404 excluded; 1.05 seconds |
| Breaking Bad S1E2 | Four Filmix 480p choices, Collaps DASH 1080p and HLS 720p; Seasonvar maintenance skipped; 1.22 seconds |

These are individual lookup measurements on the test connection, using fixed title metadata rather than a private TMDB key. They are not TV playback or end-to-end startup measurements. See [VALIDATION.md](./VALIDATION.md) for the release checks.

**Physical Samsung TV playback remains unverified.** These checks establish extraction, manifest availability and engine compatibility on the test machine; they cannot establish codec support or host access on your TV. Collaps's 1080p variants use VP9 or AV1 with Opus audio, which older TVs may not play. The 720p H.264/AAC HLS choice may be more compatible. Only source metadata and manifests, not decoded video output, were inspected. Live metadata checks use known title fixtures rather than private TMDB credentials.

## Source and development

Download [source.zip](./source.zip) for editable source, tests and build tooling. Node.js 18 or later is sufficient; no dependency installation is needed.

```text
npm test
npm run build
```

The root `manifest.json` references `russian-cinema.js`. Publish them together after rebuilding. The source archive includes synthetic test responses; captured live pages, temporary signed playback URLs and local scratch files are excluded.

MIT licensed. Public protocol references are acknowledged in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). Russian Cinema is independent of Nuvio and the listed providers.
