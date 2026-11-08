# Deployment

GitHub Pages serves `web/dist`; a separate .NET host runs the API, collector and SQLite database.

## API

The repository’s Dockerfile and `railway.json` build the complete app. Mount persistent storage at `/data` and configure:

```text
Hosting__PublicReadOnly=true
Hosting__AllowedOrigins__0=https://jpndmatos.github.io
DatabasePath=/data/touchline.db
```

Add the API’s own HTTPS origin as `Hosting__AllowedOrigins__1` when serving the bundled frontend too. Origins have no repository path or trailing slash. Railway’s root-owned volume uses `RAILWAY_RUN_UID=0`.

Keep provider credentials in the host’s secret store. Preserve the database across deployments and allow unbuffered `/api/live` responses. Collection runs only while the API host is running. Check `/api/health` after deployment.

For a manual build:

```sh
npm --prefix web ci
npm --prefix web run build
dotnet publish src/Touchline.Api -c Release -o publish
```

Run `dotnet Touchline.Api.dll` from the publish directory.

## Pages

1. In GitHub Settings → Pages, select **GitHub Actions**.
2. Set the repository variable `TOUCHLINE_API_URL` to the API’s HTTPS origin.
3. Push to `main` or run **Deploy frontend to GitHub Pages**.

The workflow sets the repository base path and publishes only the built frontend. Rebuild after changing the API URL. Public read-only mode keeps preferences in each browser and disables server preference/manual-import endpoints.
