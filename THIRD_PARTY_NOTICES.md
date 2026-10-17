Russian Cinema is an independent Nuvio provider. It is not affiliated with Filmix, Seasonvar, Collaps, KinoPub, HDVB, Nuvio or TMDB.

Protocol references:

- Filmix mobile API conventions: https://github.com/n0madic/go-filmix (MIT, Copyright (c) 2026 nomadic). This plugin implements an independent guest client and does not include that Go library or its website decoder.
- Seasonvar background reference: https://github.com/googoid/seasonvar-client. The extractor was independently implemented against current public HTML and playlist JSON; no library code is distributed.
- Collaps public player structure: https://github.com/lampac-nextgen/lampac/blob/main/Modules/OnlineRUS/Collaps/Services/Invoke.cs. This plugin independently parses inert player data; no Lampac source is included.
- FilmixTV API conventions: https://github.com/lampac-nextgen/lampac/blob/main/Modules/OnlinePaid/Filmix/Controllers/FilmixTV.cs. The disabled account adapter is independently implemented; no Lampac source or credentials are included.
- KinoPub official API documentation: https://kinoapi.com/authentication.html and https://kinoapi.com/api_video.html. Account API handling is independently implemented without borrowed client secrets or access tokens.
- HDVB partner/API background: https://hdvb-balanser.video/ and https://github.com/lampac-nextgen/lampac/blob/main/Modules/OnlineRUS/HDVB/Controller.cs. The optional adapter is independently implemented; no Lampac source or partner keys are included.

The runtime has no third-party package dependencies. Site scripts are never executed. The source package contains only synthetic test responses; captured website responses and temporary playback URLs are excluded.

Title identification uses The Movie Database. This product uses the TMDB API but is not endorsed or certified by TMDB.
