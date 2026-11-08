# Providers

The goal collector runs on the API host. The interface reports each connection’s state and last refresh. Credentials stay on the server.

## Football fixtures

Run `./scripts/configure-provider.ps1` to save a football-data.org token in .NET user secrets. Restart the API afterwards. On a host, use the `FootballData__Token` secret.

Fixtures add match metadata; they do not control which goals appear.

## Reddit

Only configure OAuth credentials for an approved app. Store these in .NET user secrets or the host’s secret store:

```text
Reddit__Enabled=true
Reddit__ClientId=<approved client ID>
Reddit__ClientSecret=<client secret>
Reddit__UserAgent=ExtraTime/1.0 by /u/<account>
```

An approved access token can instead use `Reddit__AccessToken`. The public feed adapter is subject to Reddit’s availability and restrictions. Cached goals remain until their original publication time reaches 48 hours; source failures never substitute fictional clips.

No independent discovery provider is enabled. Match highlights are excluded: the hub accepts individual goal clips only.

## Playback and storage

Goal discovery and video hosting are separate. The player can retry metadata and switch between known sources for the same goal. An embedded host can still restrict playback.

The local database defaults to `src/Touchline.Api/data/touchline.db`; override `DatabasePath` for another location. Pages stores viewing preferences in each visitor’s browser. `?sample=true` uses separate preferences and provides no footage.
