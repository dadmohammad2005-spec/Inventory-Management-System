# StockFlow ERP Launcher Script for PowerShell
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  StockFlow - Production ERP Inventory & Order System" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$pythonExe = Join-Path $scriptDir "backend\venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    Write-Host "[INFO] Virtual environment not found. Creating backend\venv..." -ForegroundColor Yellow
    py -m venv backend/venv
    & (Join-Path $scriptDir "backend\venv\Scripts\pip.exe") install -r backend/requirements.txt
}

Write-Host "[INFO] Applying database migrations..." -ForegroundColor Green
& $pythonExe backend/manage.py migrate --no-input

Write-Host "[INFO] Checking initial sample data..." -ForegroundColor Green
& $pythonExe backend/manage.py seed_data

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Launching StockFlow at http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

Start-Process "http://127.0.0.1:8000"

& $pythonExe backend/manage.py runserver 127.0.0.1:8000
