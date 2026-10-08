@echo off
title StockFlow Frontend Web Server (Port 3000)
cd /d "%~dp0"
echo ========================================================
echo   StockFlow Frontend Web Server
echo   Running at http://localhost:3000
echo ========================================================
echo.
echo Make sure the backend server is running at http://127.0.0.1:8000
echo.
start "" "http://localhost:3000"
python -m http.server 3000
pause
