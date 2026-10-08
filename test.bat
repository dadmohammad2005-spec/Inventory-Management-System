@echo off
cd /d "%~dp0"
call backend\venv\Scripts\activate.bat
python backend\manage.py test inventory
pause
