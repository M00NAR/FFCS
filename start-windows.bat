@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 server.py
) else (
  python server.py
)
if errorlevel 1 (
  echo.
  echo Python 3 is needed. Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
)
pause
