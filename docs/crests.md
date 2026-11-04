# Club crests

114 PNG crests are bundled in `web/public/crests`, with 139 verified display names in `src/Touchline.Api/crest-catalogue.json`. Names and original asset filenames were taken from football-data.org fixture metadata on 4 November 2026. Original assets use `https://crests.football-data.org/{filename}`. Club names and badges belong to their respective owners.

Bundling removes external image requests and makes this coverage available without a fixtures API key. Images load lazily at fixed dimensions; the API serves them with a one-week browser cache. The Pages build includes the same files below its repository base path.

Exact display aliases handle common Reddit abbreviations. Youth and women's sides can use a verified parent-club crest while retaining their own team ID and name. An explicit provider crest remains authoritative. Unknown clubs retain initials rather than receiving a badge guessed from a partial name.
