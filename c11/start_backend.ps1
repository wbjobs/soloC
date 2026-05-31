Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  启动后端服务器 (FastAPI)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location backend

Write-Host "检查依赖..." -ForegroundColor Yellow
python -c "import fastapi, uvicorn, soundfile, pydub" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  部分依赖未安装，正在安装..." -ForegroundColor Yellow
    python -m pip install -r requirements.txt
}

Write-Host ""
Write-Host "启动后端服务在 http://localhost:8000" -ForegroundColor Green
Write-Host "API文档: http://localhost:8000/docs" -ForegroundColor Green
Write-Host ""
Write-Host "按 Ctrl+C 停止服务" -ForegroundColor Yellow
Write-Host ""

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
