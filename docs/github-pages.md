# GitHub Pages deployment

GitHub Pages serves the frontend. The .NET API runs on a separate HTTPS host, with the collector enabled and a persistent SQLite volume. Pages cannot execute ASP.NET Core, keep a database or run the goal collector. Keep Reddit and football-data credentials on the API host; never put them in Vite variables or Pages artifacts.

## API host

Build and publish with the .NET 10 SDK:

```sh
npm --prefix web ci
npm --prefix web run build
dotnet publish src/Touchline.Api -c Release -o publish
```

Configure the API host with these environment variables (replace example domains):

```text
Hosting__PublicReadOnly=true
Hosting__AllowedOrigins__0=https://YOUR-USERNAME.github.io
DatabasePath=/persistent-data/touchline.db
Urls=http://0.0.0.0:8080
```

The allowed origin contains no repository path or trailing slash. A custom Pages domain needs its own exact origin. Configure provider credentials using the host's secret store and run `dotnet Touchline.Api.dll` from the publish directory. Use persistent storage and a continuously running host; stopping/sleeping prevents continuous collection. Terminate HTTPS at the host's reverse proxy and allow unbuffered long-lived `/api/live` responses.

Public read-only mode disables the preference and manual clip endpoints, including reads. Each Pages visitor stores viewing history and spoiler settings in their own browser. Dashboard, event stream and restricted clip metadata resolution remain available. The default localhost mode continues to use the original single-user SQLite preferences. CORS allows only the configured frontend origins; it is not authentication or access control for public goal data.

## Pages repository

1. Push this checkout to a GitHub repository. The workflow deploys `main`; update its branch if needed.
2. In Settings → Pages, select **GitHub Actions** as the source.
3. In Settings → Secrets and variables → Actions → Variables, set `TOUCHLINE_API_URL` to the API's HTTPS origin, for example `https://goals-api.example.com`. This is a public address, not an API key.
4. Run **Deploy frontend to GitHub Pages**, or push to `main`.

The workflow takes the repository base path from `configure-pages`, builds `web/dist`, and deploys only that artifact. Icons, home links, scripts and fonts work below `/REPOSITORY/`. REST and server events use the separately configured API origin. Deployment waits until `TOUCHLINE_API_URL` is configured and rejects invalid or localhost addresses, so it cannot publish a frontend pointing at your laptop.

## Railway API service

The repository includes a Dockerfile and `railway.json` with a health check and one continuously running instance. The container serves the frontend too, as a fallback if Pages is unavailable; its build uses browser-local preferences without a separate API origin. Deploy from the repository root. Mount a persistent volume at `/data`, configure `Hosting__AllowedOrigins__0=https://jpndmatos.github.io`, and set `RAILWAY_RUN_UID=0` for Railway's root-owned volume. Public read-only mode and `/data/touchline.db` are already container defaults. Keep the service awake to collect goals without viewers. The primary frontend can be deployed separately through Pages.

Generate an HTTPS service domain and add its exact origin as `Hosting__AllowedOrigins__1` so the bundled frontend can resolve clips behind Railway's HTTPS proxy. Verify `/api/health`, then save that origin as `TOUCHLINE_API_URL` in the GitHub repository and run the Pages workflow. RSS discovery works without provider secrets, subject to its stated limits. Credentials for optional providers must be configured only through the host's secret settings.

Changing the API address requires rebuilding the frontend. Pages does not remove Reddit rate limits or provide approved Reddit access; existing coverage limits remain.

## Local split-host verification

```powershell
$env:VITE_API_URL='http://127.0.0.1:5196'
$env:PAGES_BASE_PATH='/touchline/'
npm --prefix web run build
```

Serve `web/dist` at `/touchline/` from a static server. Configure the separate test API's exact frontend origin and public read-only mode. Verify dashboard, `/api/live`, `/api/media`, logo/home links, local seen persistence and spoiler settings. Unset both build variables before returning to the default localhost build.

References: [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Vite Pages deployment](https://vite.dev/guide/static-deploy.html#github-pages).
