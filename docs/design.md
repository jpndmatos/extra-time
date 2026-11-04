# Touchline goals-only hub

The application is a single full-width goal feed and player. Every goal returned by the provider is available without a favourite-team catalogue, match selection, navigation tabs or setup screens. Old view, team, match and feed query parameters are ignored and removed from the canonical URL. Goal search remains in the header alongside spoiler and refresh controls.

Poppins is locally hosted. Neutral surfaces distinguish unseen and seen goals. Muted burnt orange identifies unwatched rows, deep green identifies the active clip, and subtle rules separate compact records. Minute, team names, scores and scorer use aligned columns. Search accepts aliases and accents while protecting hidden scorer details.

Opening a goal updates its seen state immediately and saves in the background. On phones, the player mounts only when opened and unloads on Back to goals. Spoiler-protected clips count after reveal. Manual mark-as-unwatched stays respected. Previous/Next follows the visible results and keeps the selected row in view. Cinema is available on desktop.

Retain source attribution, metadata resolution, mirror recovery, live server events, and loading/error/empty/full states. Sample mode is explicitly fictional and supplies no footage. No banners, catalogue limits or fixture configuration block the real feed. Legacy backend preferences and import endpoints remain compatible; the UI does not expose or depend on favourites.
