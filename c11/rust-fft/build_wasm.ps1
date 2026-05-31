Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  编译 Rust WASM 模块 (Safari 兼容版)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/4] 检查 wasm-pack..." -ForegroundColor Yellow
$wasmPack = Get-Command wasm-pack -ErrorAction SilentlyContinue
if (-not $wasmPack) {
    Write-Host "⚠️  wasm-pack 未安装，正在安装..." -ForegroundColor Yellow
    cargo install wasm-pack
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ wasm-pack 安装失败" -ForegroundColor Red
        Write-Host "   请手动执行: cargo install wasm-pack" -ForegroundColor White
        exit 1
    }
}
Write-Host "✓ wasm-pack 已就绪" -ForegroundColor Green

Write-Host ""
Write-Host "[2/4] 清理旧的构建..." -ForegroundColor Yellow
if (Test-Path "pkg") {
    Remove-Item -Recurse -Force "pkg"
    Write-Host "✓ 已清理 pkg/ 目录" -ForegroundColor Green
}

Write-Host ""
Write-Host "[3/4] 编译为 WebAssembly (target: web)..." -ForegroundColor Yellow
Write-Host "   使用 --target web 确保 Safari 兼容性" -ForegroundColor Gray
Write-Host ""

wasm-pack build --target web --release -- --features "console_error_panic_hook"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ WASM 编译失败" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[4/4] 生成 Safari 兼容性包装模块..." -ForegroundColor Yellow

$loaderCode = @'
export async function loadWasmModule() {
  if (typeof WebAssembly === 'undefined') {
    throw new Error('您的浏览器不支持 WebAssembly');
  }

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  
  if (isSafari || isIOS) {
    console.log('[WASM] 检测到 Safari/iOS，使用兼容加载模式');
  }

  try {
    const wasm = await import('./rust_fft.js');
    await wasm.default();
    
    if (typeof wasm.init_panic_hook === 'function') {
      wasm.init_panic_hook();
    }
    
    console.log('[WASM] Rust FFT 模块加载成功');
    return wasm;
  } catch (error) {
    console.error('[WASM] 加载失败:', error);
    throw error;
  }
}

export function createFftAnalyzer(wasm, fftSize = 1024) {
  if (!wasm || !wasm.FftAnalyzer) {
    throw new Error('WASM 模块未正确初始化');
  }
  return new wasm.FftAnalyzer(fftSize);
}

export function analyzeAudio(analyzer, samples, sampleRate, timestamp) {
  try {
    const result = analyzer.analyze_f64(samples, sampleRate, timestamp);
    const magnitudes = result.magnitudes();
    const frequencies = result.frequencies();
    
    if (typeof result.free === 'function') {
      result.free();
    }
    
    return {
      frequencies,
      magnitudes,
      sample_rate: sampleRate,
      fft_size: analyzer.get_fft_size(),
      timestamp
    };
  } catch (error) {
    console.error('[WASM] FFT 分析失败:', error);
    throw error;
  }
}

export function disposeAnalyzer(analyzer) {
  if (analyzer && typeof analyzer.free === 'function') {
    try {
      analyzer.free();
    } catch (e) {
      console.warn('[WASM] 释放 analyzer 失败:', e);
    }
  }
}
'@

$loaderPath = Join-Path "pkg" "wasm_loader.js"
Set-Content -Path $loaderPath -Value $loaderCode -Encoding UTF8
Write-Host "✓ 已生成 wasm_loader.js" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  WASM 编译完成！" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "输出目录: rust-fft/pkg/" -ForegroundColor White
Write-Host ""
Write-Host "使用方法:" -ForegroundColor Cyan
Write-Host '  import { loadWasmModule, createFftAnalyzer, analyzeAudio, disposeAnalyzer } from "./pkg/wasm_loader.js"' -ForegroundColor Gray
Write-Host '  const wasm = await loadWasmModule();' -ForegroundColor Gray
Write-Host '  const analyzer = createFftAnalyzer(wasm, 1024);' -ForegroundColor Gray
Write-Host '  const result = analyzeAudio(analyzer, samples, 44100, 0.0);' -ForegroundColor Gray
Write-Host '  disposeAnalyzer(analyzer);' -ForegroundColor Gray
