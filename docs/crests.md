# Club crests

The catalogue includes 551 bundled PNG crests and 794 display names. The 8 November 2026 audit covered every club appearing in the rolling 48-hour goal feed, including lower divisions, women’s sides, MLS, Asia and Australia.

Sources:

- The original football-data.org fixture catalogue and its crest CDN.
- ESPN league team metadata and the corresponding ESPN crest CDN. Each added catalogue entry records its source URL.
- Wikipedia club articles and their Wikimedia crest images for clubs outside those league lists.
- Stal Rzeszów’s own club website for its crest.

Club names and badges belong to their respective owners. Source records identify the artwork; no badge is generated or guessed from a similar club name.

New assets are resized to at most 96 × 96 pixels, stored as transparent PNGs, loaded lazily at fixed dimensions and served from the app’s own origin. GitHub Pages includes the same files beneath the repository base path. No runtime artwork API or extra API key is required.

Provider crests remain authoritative. Each known team also receives a bundled recovery crest, so a failed provider image and its PNG/SVG alternate can recover locally. Youth and women’s sides retain their own IDs. Exact aliases resolve common Reddit names without confusing Oxford City with Oxford United, Austria Salzburg with RB Salzburg, or Hong Kong Rangers with Rangers.

`CrestCoverageTests` checks the audited feed names and these identity boundaries. `scripts/verify-crests.mjs` checks real browser decoding and provider failure recovery.
