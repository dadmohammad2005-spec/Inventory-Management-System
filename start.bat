@echo off
title StockFlow Inventory & Order Management System
echo ========================================================
echo   StockFlow - Production ERP Inventory & Order System
echo ========================================================
echo.

cd /d "%~dp0"

IF NOT EXIST "backend\venv\Scripts\python.exe" (
    echo [INFO] Virtual environment not found. Setting up backend\venv...
    py -m venv backend\venv
    call backend\venv\Scripts\activate.bat
    pip install -r backend\requirements.txt
) ELSE (
    call backend\venv\Scripts\activate.bat
)

echo [INFO] Running database migrations...
python backend\manage.py migrate --no-input

echo [INFO] Checking initial demo data...
python backend\manage.py seed_data

echo.
echo ========================================================
echo   Starting StockFlow Server at http://127.0.0.1:8000
echo ========================================================
echo.

start "" "http://127.0.0.1:8000"

python backend\manage.py runserver 127.0.0.1:8000
pause
