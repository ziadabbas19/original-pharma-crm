# API container image. Build context: BACKEND/ (see the "api" profile in docker-compose.yml).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish src/OriginalPharma.Api -c Release -o /app -p:OpenApiGenerateDocuments=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
# Uploaded images live on a mounted volume, never in the image or the repository.
ENV ASPNETCORE_URLS=http://+:8080 \
    FileStorage__RootPath=/var/lib/original-pharma/uploads
RUN mkdir -p /var/lib/original-pharma/uploads && chown app:app /var/lib/original-pharma/uploads
VOLUME /var/lib/original-pharma/uploads
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "OriginalPharma.Api.dll"]
