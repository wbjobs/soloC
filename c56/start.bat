@echo off
echo ========================================
echo    Query Gateway - 启动脚本
echo ========================================
echo.

echo [1/2] 启动后端服务...
cd backend
start cmd /k "cargo run"

timeout /t 3 /nobreak > nul

echo.
echo [2/2] 启动前端服务...
cd ..\frontend
start cmd /k "npm install && npm run dev"

echo.
echo ========================================
echo    服务正在启动中...
echo    后端: http://localhost:8080
echo    前端: http://localhost:5173
echo ========================================
pause
