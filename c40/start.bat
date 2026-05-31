@echo off
echo ========================================
echo 工业设备监控系统 - 启动脚本
echo ========================================
echo.

echo [1/4] 启动基础设施 (MQTT, InfluxDB, Redis)...
docker-compose up -d
echo.
timeout /t 10 /nobreak

echo [2/4] 启动 Spring Boot 后端...
start cmd /k "cd backend && mvn spring-boot:run"
echo.
timeout /t 5 /nobreak

echo [3/4] 启动设备模拟器...
start cmd /k "cd device-simulator && python device_simulator.py"
echo.
timeout /t 3 /nobreak

echo [4/4] 启动 Vue3 前端...
start cmd /k "cd frontend && npm run dev"
echo.

echo ========================================
echo 所有服务启动中...
echo.
echo 访问地址:
echo - 前端仪表板: http://localhost:3000
echo - 后端 API: http://localhost:8080
echo - InfluxDB: http://localhost:8086
echo.
echo 按任意键退出...
pause >nul
