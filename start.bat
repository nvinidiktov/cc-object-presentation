@echo off
title CC Object Presentation

echo.
echo === CC Object Presentation ===
echo.

echo [1/4] Checking Node.js...
node --version
if errorlevel 1 (
    echo ERROR: Node.js not found!
    echo Please install from https://nodejs.org
    pause
    exit /b 1
)
echo.

echo [2/4] Freeing ports 3001 and 5173 (closing old sessions)...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3001 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5173 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo Done.
echo.

echo [3/4] Installing dependencies...
echo (First time: 5-10 min while Puppeteer downloads Chromium)
echo Please wait, do not close this window...
echo.
call npx --yes pnpm@9 install
if errorlevel 1 (
    echo.
    echo ERROR: Installation failed. See message above.
    pause
    exit /b 1
)
echo.

echo [4/4] Starting application...
echo Browser will open at http://localhost:5173
echo To stop: close this window.
echo.
start /b cmd /c "timeout /t 10 /nobreak >nul && start http://localhost:5173"
call npx --yes pnpm@9 dev

pause
