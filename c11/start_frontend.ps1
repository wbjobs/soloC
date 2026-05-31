Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  启动前端开发服务器 (Vite + React)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location frontend

Write-Host "检查依赖..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "⚠️  node_modules不存在，正在安装依赖..." -ForegroundColor Yellow
    npm install
}

Write-Host ""
Write-Host "启动前端服务在 http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "按 Ctrl+C 停止服务" -ForegroundColor Yellow
Write-Host ""

npm run dev
