# Post Generation Pipeline — start backend + UI (social posts only)
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

$apiPort = 8001
$uiPort = 3001

Write-Host "Starting Post Generation Pipeline"
Write-Host "  API: http://localhost:$apiPort"
Write-Host "  UI:  http://localhost:$uiPort"
Write-Host ""

$backendCmd = @"
Set-Location '$Root'
`$env:API_PORT = '$apiPort'
`$env:CLIENTS_DATA_DIR = 'clients'
python main.py
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

Set-Location (Join-Path $Root "atlas-ui")
$env:PORT = "$uiPort"
$env:REACT_APP_API_URL = "http://localhost:$apiPort"
$env:REACT_APP_PROJECT_MODE = "social"
npm start
