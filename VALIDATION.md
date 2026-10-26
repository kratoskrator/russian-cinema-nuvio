# Russian Cinema 1.1.1 validation

Checked on 26 October 2026. All checks use the compiled `russian-cinema.js` bundle where applicable.

## Changed behavior

- Media validation starts as each provider resolves, independently of the other providers.
- Verified HD (1080p or higher) and an HLS/MP4 choice allow the current source list to return without waiting for unused origins or alternate manifests. Already verified choices are retained in provider order. A completed list can contain fewer voiceovers/codecs than a fully collected list.
- Configured KinoPub and HDVB providers complete before early return, preserving their potential higher-resolution choices. Empty credentials still cause no account requests. FilmixTV remains disabled in the TV runtime.
- Lookup completion aborts pending fetches through the TV's existing AbortController bridge and prevents further lookup requests. It also releases pending promises in older guests without AbortController.
- A short maintenance response such as Seasonvar's current “Технические работы” is recognized even with HTTP 200, preventing the second translated-title search.

## Automated checks

`npm test`: **130 passed, zero failed**. The previous 123 tests remain, with seven added regressions for maintenance, cancellation, stalled origins, stalled alternate manifests, pending HD and optional account quality.

The compiled bundle additionally passed **21 QuickJS fixture scenarios**, using the 26 October Nuvio TV worker's exact fetch polyfill, a 32 MiB memory limit and a 512 KiB stack limit. These deliberately strict limits are validation settings, not a claim about every installed TV build.

Scenarios cover anonymous movies/episodes, Seasonvar parsing, provider blocks, invalid requests, empty metadata credentials, invalid/DRM manifests, identity AES-128 HLS, disabled FilmixTV account settings, optional own-account success/denial and credential boundaries. New stalled-origin and stalled-alternate scenarios return valid HD plus HLS and issue native cancellation without waiting for the stalled requests. Maintenance is separately tested. Cases that previously required every voiceover now require the intended verified HD/HLS result after early completion.

## Current ordinary network checks

Three anonymous lookups ran through the same QuickJS guest and the official, unmodified Nuvio TV HTTP service fetched on 26 October. TMDB title metadata was supplied as a fixture; source searches, player pages, manifests and small MP4 probes used current public responses.

| Request | Returned verified choices | Lookup time |
| --- | --- | --- |
| Interstellar, movie | Two Filmix MP4 480p; Collaps DASH 1080p AV1/Opus; Collaps HLS 720p H.264/AAC | 875 ms |
| The Shawshank Redemption, movie | Collaps DASH 1080p AV1/Opus and HLS 720p H.264/AAC; Filmix 404 excluded | 1,054 ms |
| Breaking Bad S1E2 | Four Filmix MP4 480p; Collaps DASH 1080p AV1/Opus; Collaps HLS 720p H.264/AAC; Seasonvar maintenance skipped | 1,219 ms |

Seasonvar's homepage and search both returned only its maintenance message with HTTP 200. Its adapter remains available for when the site resumes; no alternate website was silently substituted.

Manifests were inspected for playable structure, advertised dimensions/codecs and DRM markers. MP4 requests were limited to bytes 0–63 and required matching HTTP 206 and `ftyp`. No media segments, complete video files, DRM keys, CAPTCHA solvers, proxy services or downloaded site scripts were used.

## Limits

Physical Samsung playback remains untested. The live 1080p choice used AV1/Opus, which some TVs cannot play; the returned 720p H.264/AAC HLS choice is generally more compatible. Other available codecs can vary because unused checks are cancelled after usable results are ready. These checks do not establish the codecs supported by a particular TV or its network's access to the media hosts.

KinoPub and HDVB were fixture-tested only; no subscriber/partner credentials were available. The default guest providers require no provider account. Live lookup times exclude real TMDB latency and TV video startup.

Official source provenance used for this validation: [NuvioTVSmart](https://github.com/NuvioMedia/NuvioTVSmart), `js/core/player/pluginWorker.js` and `services/plugin-http.cjs`.

- Worker SHA-256: `7a8487fda3de07d4375d19bc9267067aeb18809207968fe3cb758b8253f019ae`
- HTTP service SHA-256: `46e162bf569633ea1575eba9530630bc636c6f46a067bbb17e6636ab055fa743`

Temporary signed media URLs and captured live response bodies are excluded from the public source archive.
