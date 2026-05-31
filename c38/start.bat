@echo off
chcp 65001 > nul
echo ========================================
echo    三维地质模型剖切系统 - 启动脚本
echo ========================================
echo.

echo [1/3] 检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)
echo Python 环境检查通过
echo.

echo [2/3] 启动后端服务...
echo 后端地址: http://localhost:5000
start "后端服务" cmd /k "cd /d "%~dp0backend" && echo 正在安装 Python 依赖... && pip install -r requirements.txt -q && echo. && echo 启动 Flask 服务... && python app.py"

echo.
echo 等待后端服务启动...
timeout /t 8 /nobreak > nul

echo.
echo [3/3] 启动前端服务...
echo 前端地址: http://localhost:3000
start "前端服务" cmd /k "cd /d "%~dp0frontend" && echo 正在安装 npm 依赖... && npm install --silent && echo. && echo 启动 Vite 开发服务器... && npm run dev"

echo.
echo ========================================
echo 系统启动完成！
echo 请在浏览器中打开: http://localhost:3000
echo ========================================
echo.
echo 提示:
echo   - 左键拖动: 旋转模型
echo   - 右键拖动: 平移模型
echo   - 滚轮: 缩放模型
echo.
pause
