@echo off
echo ========================================
echo     太空无人机收集游戏 - 服务器启动
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] 检查Go环境...
where go >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: Go未安装或未添加到PATH
    echo 请运行: winget install GoLang.Go
    pause
    exit /b 1
)
echo Go环境检查通过!
echo.

echo [2/3] 下载依赖...
go mod download
if %errorlevel% neq 0 (
    echo 警告: 依赖下载可能有问题，继续尝试启动...
)
echo 依赖处理完成!
echo.

echo [3/3] 启动游戏服务器...
echo.
echo ========================================
echo    服务器启动成功!
echo    请在浏览器中打开: http://localhost:8080
echo ========================================
echo.

cd backend
go run main.go

pause
