FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source
COPY Directory.Build.props ./
COPY src/Touchline.Api/Touchline.Api.csproj src/Touchline.Api/
RUN dotnet restore src/Touchline.Api/Touchline.Api.csproj
COPY src/Touchline.Api/ src/Touchline.Api/
RUN dotnet publish src/Touchline.Api/Touchline.Api.csproj -c Release --no-restore -o /publish -p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /publish/ ./
ENV Hosting__PublicReadOnly=true \
    DatabasePath=/data/touchline.db \
    DOTNET_EnableDiagnostics=0
RUN mkdir -p /data /app/wwwroot && chown -R app:app /data /app/wwwroot
USER app
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec dotnet Touchline.Api.dll --urls \"http://0.0.0.0:${PORT:-8080}\""]
