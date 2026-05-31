Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  安装音频频谱分析系统依赖" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] 检查Python环境..." -ForegroundColor Yellow
$pythonAvailable = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonAvailable) {
    Write-Host "❌ Python未安装，请先安装Python 3.9+" -ForegroundColor Red
    exit 1
}
$pythonVersion = python --version
Write-Host "✓ Python已安装: $pythonVersion" -ForegroundColor Green

Write-Host ""
Write-Host "[2/3] 安装后端依赖..." -ForegroundColor Yellow
Set-Location backend
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 后端依赖安装失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 后端依赖安装完成" -ForegroundColor Green
Set-Location ..

Write-Host ""
Write-Host "[3/3] 安装前端依赖..." -ForegroundColor Yellow
$nodeAvailable = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeAvailable) {
    Write-Host "⚠️  Node.js未安装，请先安装Node.js 18+" -ForegroundColor Yellow
    Write-Host "   下载地址: https://nodejs.org/" -ForegroundColor Yellow
} else {
    $nodeVersion = node --version
    Write-Host "✓ Node.js已安装: $nodeVersion" -ForegroundColor Green
    Set-Location frontend
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 前端依赖安装失败" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ 前端依赖安装完成" -ForegroundColor Green
    Set-Location ..
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  所有依赖安装完成！" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "运行步骤:" -ForegroundColor Cyan
Write-Host "  1. 启动后端: .\start_backend.ps1" -ForegroundColor White
Write-Host "  2. 启动前端: .\start_frontend.ps1" -ForegroundColor White
Write-Host "  3. 访问: http://localhost:5173" -ForegroundColor White
