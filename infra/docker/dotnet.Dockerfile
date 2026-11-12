# syntax=docker/dockerfile:1
# Image .NET 10 d'un projet du back (EVAN.Api, EVAN.Simulator, EVAN.Gateway) : PROJECT=nom du dossier sous src/.
# Contexte de build : racine du dépôt (réglages communs, data/ et sources ; voir dotnet.Dockerfile.dockerignore).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG PROJECT=EVAN.Api
WORKDIR /repo
COPY Directory.Build.props Directory.Packages.props ./
COPY data/catalog.json data/demo.json data/
COPY data/kit/machines.json data/kit/
COPY src/ src/
# Cache NuGet partagé entre les builds et entre les trois images : les paquets ne sont téléchargés qu'une fois.
# Verrouillé : compose construit les images en parallèle, et NuGet ne supporte pas deux restaurations dans le même dossier.
RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages,sharing=locked \
    dotnet publish "src/${PROJECT}/${PROJECT}.csproj" -c Release -o /app -p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:11.0
ARG PROJECT=EVAN.Api
ENV APP=${PROJECT}
WORKDIR /app
COPY --from=build /app .
# /data : PKI OPC UA et journal des écritures de la passerelle (volume), inscriptible par l'utilisateur non root.
RUN mkdir -p /data && chown "$APP_UID" /data
USER $APP_UID
ENTRYPOINT ["sh", "-c", "exec dotnet \"$APP.dll\""]
