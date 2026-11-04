# Independent goal discovery

The feed accepts individual goal clips only. Match highlights are not an approved fallback.

Highlightly is a candidate: its highlights response explicitly categorises `goal-clip` separately from `match-highlights`, and identifies the aggregation source. A connector must accept only `goal-clip` and exclude Reddit sources and Reddit URLs. The free plan covers selected leagues; it does not replace comprehensive Premier League or Champions League discovery. An API key is required. See [the provider’s current contract and coverage](https://highlightly.net/football-api/documentation/highlights/).

Before enabling it, verify an actual keyed response, the original publication timestamp, embedding support and goal-specific score/minute metadata. Match kickoff and a match’s current clock must not be presented as the clip’s publication time or the goal’s minute. Unsupported or ambiguous records should be skipped rather than guessed. Keep provider credentials on the API host.

ScoreBat’s free feed and TheSportsDB’s public video feed focus on limited match highlights, so neither is enabled in this goal-only hub. References: [ScoreBat](https://www.scorebat.com/video-api/docs/), [TheSportsDB](https://api.thesportsdb.com/documentation).

No independent provider is currently enabled. Reddit RSS retirement still requires approved Reddit API access or a separately verified goal-clip provider; changing the video host alone does not replace discovery.
