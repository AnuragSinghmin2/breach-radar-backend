# Start MongoDB for local development (no admin required)
$mongod = "C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe"
$dbPath = Join-Path $PSScriptRoot "..\data\mongodb"
$logPath = Join-Path $PSScriptRoot "..\data\mongodb-log\mongod.log"

if (-not (Test-Path $mongod)) {
  Write-Error "mongod.exe not found at $mongod. Install MongoDB or update the path in this script."
  exit 1
}

New-Item -ItemType Directory -Force -Path $dbPath, (Split-Path $logPath) | Out-Null

Write-Host "Starting MongoDB on 127.0.0.1:27017 ..."
Write-Host "Data: $dbPath"

& $mongod --dbpath $dbPath --logpath $logPath --bind_ip 127.0.0.1 --port 27017
