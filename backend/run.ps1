# Start the FastAPI backend bound to all interfaces so phones on the same
# Wi-Fi can reach it at http://<your-LAN-IP>:8000.
#
# Usage: from the backend directory, run:  .\run.ps1
# Override host/port via env vars if needed:  $env:PORT = '8001'; .\run.ps1

$ErrorActionPreference = 'Stop'

Push-Location $PSScriptRoot
try {
    $venvPython = Join-Path $PSScriptRoot 'venv\Scripts\python.exe'
    $python = if (Test-Path $venvPython) { $venvPython } else { 'python' }

    if (-not $env:HOST) { $env:HOST = '0.0.0.0' }
    if (-not $env:PORT) { $env:PORT = '8000' }

    Write-Host "Starting backend on http://$($env:HOST):$($env:PORT) ..." -ForegroundColor Cyan
    & $python -m uvicorn server:app --host $env:HOST --port $env:PORT
}
finally {
    Pop-Location
}
