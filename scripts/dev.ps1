<#
  Lance toute la chaîne EVAN sans Docker, chaque service dans sa fenêtre :
    broker MQTT de développement (18830, sans TLS) → simulateur .NET → API (stockage en mémoire, assistant, serveur MCP
    sur /mcp) → front Vite. L'assistant utilise ANTHROPIC_API_KEY si elle est définie (les fenêtres héritent de l'environnement).
  Usage : powershell -ExecutionPolicy Bypass -File scripts/dev.ps1
  Puis http://localhost:5173/demo (l'indicateur en haut affiche « Temps réel »).
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$front = Join-Path $root 'src/EVAN.Front'

# La cible (.NET 10, ou 9 avec un SDK 9) est choisie par Directory.Build.props.
dotnet build (Join-Path $root 'EVAN.slnx') | Out-Null

$mqtt = '$env:Evan__Mqtt__Host=''localhost''; $env:Evan__Mqtt__Port=''18830''; $env:Evan__Mqtt__Tls=''false'';'
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root'; dotnet run --project tools/EVAN.DevBroker --no-build"
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root'; $mqtt `$env:ASPNETCORE_URLS='http://localhost:8080'; dotnet run --project src/EVAN.Api --no-build --no-launch-profile"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root'; $mqtt `$env:Simulator__Exclude__0='m-pv01'; dotnet run --project src/EVAN.Simulator --no-build"
if (-not (Test-Path (Join-Path $front 'node_modules'))) { Push-Location $front; npm install; Pop-Location }
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$front'; `$env:EVAN_API='http://localhost:8080'; npm run dev"
Write-Host 'Démarré : http://localhost:5173/demo'
Write-Host 'Serveur MCP : http://localhost:8080/mcp (claude mcp add --transport http evan http://localhost:8080/mcp)'
if (-not $env:ANTHROPIC_API_KEY) { Write-Host 'Assistant « Demander à EVAN » : définir ANTHROPIC_API_KEY avant de lancer ce script pour l''activer.' }
