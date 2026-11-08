# Extra Time

A hub for individual football goal clips from the last 48 hours. Search teams or scorers, watch goals from the same match and keep seen clips in a separate list. .NET 10, React, TypeScript and SQLite.

[Open app](https://jpndmatos.github.io/touchline/)

![Extra Time goal hub](docs/goal-room-live.png)

## Run

.NET 10 SDK and Node.js 22.14+.

```powershell
./scripts/start.ps1
```

Open http://127.0.0.1:5195. If the SDK is outside PATH, pass `-DotNet /path/to/dotnet`.

For hot reload, run `dotnet run --project src/Touchline.Api --no-launch-profile` and `npm --prefix web run dev` in separate terminals. Vite runs on port 5194.

## Check

```sh
dotnet test Touchline.sln
npm --prefix web test
npm --prefix web run build
```

With the app running, install browser tooling using `npm ci` and `npx playwright install chromium`, then run `npm run test:browser`.

## Hosting and sources

GitHub Pages serves the frontend; Railway hosts the API and persistent collector. [Deployment](docs/github-pages.md) · [Provider configuration](docs/providers.md) · [Crest sources](docs/crests.md).

Discovery depends on provider access. Playback depends on the original video hosts; failed sources retry or switch to another clip of the same goal. Connection status reports availability. Sample mode (`?sample=true`) contains fictional metadata and no footage.
