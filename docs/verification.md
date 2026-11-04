# Verification

The API and UI build with .NET 10 and TypeScript strict mode. There are 27 backend tests and three frontend feed-filter tests. Browser checks use an isolated SQLite database.

External API connectors are verified against controlled football-data and Reddit response shapes, including 403/429 failures and request caching. No personal API keys were available during implementation, so actual live-provider access is unverified.

Sample fixtures are fictional, goal metadata is labelled and no sample footage is invented. Manual import and inline-player loading are checked with an intercepted test embed. Real video availability, region restrictions and removals depend on the original provider.

Hallmark review runs in-thread in the Codex harness. Initial findings: mobile source-status placement, spoiler button accessible name, spacing consistency. All were corrected. The selected-goal side rule carries actual selection state rather than decoration. The goal-row height waiver applies because each complete multi-line feed entry is selectable, rather than a standard toolbar button. The match rail is available as the Matchday screen on phones; the mobile player has a dedicated Back to goals action.

Live-feed checks verify SSE delivery after a manual write, per-provider refresh cadence and the shared fixture request budget. Browser checks prove goals appear without another REST dashboard request, a playing iframe stays mounted, cinema view expands and exits with Escape, offline reconnection catches up, and the workspace spans 1920px. These use controlled local clips and provider responses; upstream credentials remain unavailable.

Credential setup uses a hidden PowerShell prompt and stdin to the .NET secrets tool; no actual key was supplied or stored during implementation. The helper was syntax-checked. Matchday tests advance the browser clock through midnight, verify explicit dates survive reload and check that Today restores automatic rollover.
