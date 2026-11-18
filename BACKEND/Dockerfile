# API container image. Build context: BACKEND/ (Railway: set the service root directory to BACKEND).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish src/OriginalPharma.Api -c Release -o /app -p:OpenApiGenerateDocuments=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
# PORT, when the platform sets it, takes over from 8080. Everything else comes from the
# environment at run time (see .env.production.example); the image holds no configuration.
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS= \
    ASPNETCORE_URLS=http://+:8080
# Mount point for the data volume, which holds the uploads and keys folders. The volume is attached
# by the platform or `podman run -v`: Railway rejects the VOLUME instruction.
RUN mkdir -p /var/lib/original-pharma/uploads /var/lib/original-pharma/keys \
    && chown -R app:app /var/lib/original-pharma \
    && chmod 700 /var/lib/original-pharma/keys
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "OriginalPharma.Api.dll"]
