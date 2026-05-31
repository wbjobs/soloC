@echo off
echo ========================================
echo   Video Subtitle Editor - Startup
echo ========================================
echo.

echo [1/2] Starting backend server...
start cmd /k "cd /d %~dp0server && npm install && npm start"

timeout /t 3 /nobreak >nul

echo [2/2] Starting frontend dev server...
start cmd /k "cd /d %~dp0client && npm install && npm run dev"

echo.
echo ========================================
echo   Services starting...
echo   Backend:  http://localhost:4000
echo   Frontend: http://localhost:3000
echo ========================================
echo.
pause
