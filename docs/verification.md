# Verification

The API and UI build with .NET 10 and TypeScript strict mode. There are 27 backend tests and three frontend feed-filter tests. Browser checks use an isolated SQLite database.

External API connectors are verified against controlled football-data and Reddit response shapes, including 403/429 failures and request caching. On 2026-11-04, a football-data.org account was registered and verified, its key was saved outside the repository in local .NET user secrets, and the actual API returned HTTP 200. Touchline loaded 55 fixtures across its date window and reported the source as connected. Reddit access remains unavailable and unverified against a real account.

Sample fixtures are fictional, goal metadata is labelled and no sample footage is invented. Manual import and inline-player loading are checked with an intercepted test embed. Real video availability, region restrictions and removals depend on the original provider.

Hallmark review runs in-thread in the Codex harness. Initial findings: mobile source-status placement, spoiler button accessible name, spacing consistency. All were corrected. The selected-goal side rule carries actual selection state rather than decoration. The goal-row height waiver applies because each complete multi-line feed entry is selectable, rather than a standard toolbar button. The match rail is available as the Matchday screen on phones; the mobile player has a dedicated Back to goals action.

Live-feed checks verify SSE delivery after a manual write, per-provider refresh cadence and the shared fixture request budget. Browser checks prove goals appear without another REST dashboard request, a playing iframe stays mounted, cinema view expands and exits with Escape, offline reconnection catches up, and the workspace spans 1920px. The clip and reconnection checks use controlled local clips and provider responses. The fixture connector has additionally passed the real-provider check described above.

Credential setup uses a hidden PowerShell prompt and stdin to the .NET secrets tool; no actual key was supplied or stored during implementation. The helper was syntax-checked. Matchday tests advance the browser clock through midnight, verify explicit dates survive reload and check that Today restores automatic rollover.
