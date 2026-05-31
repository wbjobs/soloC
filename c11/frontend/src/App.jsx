import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import './App.css'

const BAR_COUNT = 64
const MAX_MAGNITUDE = 80
const MIN_MAGNITUDE = -100
const HEATMAP_HISTORY_LENGTH = 100
const HEATMAP_FREQ_BINS = 64

function normalizeMagnitude(mag) {
  return Math.max(0, Math.min(1, (mag - MIN_MAGNITUDE) / (MAX_MAGNITUDE - MIN_MAGNITUDE)))
}

function viridisColor(normalizedValue) {
  const colors = [
    [0.267004, 0.004874, 0.329415],
    [0.283072, 0.130895, 0.449241],
    [0.262138, 0.242286, 0.520837],
    [0.220057, 0.343307, 0.549413],
    [0.177423, 0.437527, 0.557565],
    [0.143343, 0.522773, 0.556295],
    [0.119512, 0.607464, 0.540218],
    [0.166383, 0.690856, 0.496502],
    [0.319809, 0.770914, 0.411152],
    [0.525776, 0.833491, 0.288127],
    [0.762373, 0.876424, 0.137064],
    [0.993248, 0.906157, 0.143936]
  ]
  
  const clamped = Math.max(0, Math.min(0.9999, normalizedValue))
  const scaled = clamped * (colors.length - 1)
  const index = Math.floor(scaled)
  const t = scaled - index
  
  const c1 = colors[index]
  const c2 = colors[Math.min(index + 1, colors.length - 1)]
  
  return new THREE.Color(
    c1[0] + (c2[0] - c1[0]) * t,
    c1[1] + (c2[1] - c1[1]) * t,
    c1[2] + (c2[2] - c1[2]) * t
  )
}

function SpectrumBars({ magnitudes, maxBars = BAR_COUNT }) {
  const meshRefs = useRef(new Array(maxBars).fill(null))
  const colors = useMemo(() => {
    const colorArray = []
    for (let i = 0; i < maxBars; i++) {
      const hue = i / maxBars
      colorArray.push(new THREE.Color().setHSL(hue * 0.8 + 0.5, 0.8, 0.5))
    }
    return colorArray
  }, [maxBars])
  
  const spacing = 0.6
  const totalWidth = maxBars * spacing
  const startX = -totalWidth / 2 + spacing / 2
  
  const displayMagnitudes = useMemo(() => {
    const sliced = magnitudes.slice(0, maxBars)
    while (sliced.length < maxBars) {
      sliced.push(-80)
    }
    return sliced.map(m => normalizeMagnitude(m))
  }, [magnitudes, maxBars])
  
  useFrame(() => {
    meshRefs.current.forEach((mesh, i) => {
      if (mesh) {
        const value = displayMagnitudes[i]
        const height = Math.max(0.05, value * 8)
        mesh.position.y = height / 2
        mesh.scale.y = height / mesh.geometry.parameters.height
      }
    })
  })
  
  return (
    <group position={[0, 0, 0]}>
      {Array.from({ length: maxBars }).map((_, i) => {
        const color = colors[i]
        return (
          <mesh
            key={`bar-${i}`}
            ref={el => meshRefs.current[i] = el}
            position={[startX + i * spacing, 0.025, 0]}
          >
            <boxGeometry args={[0.4, 0.05, 0.4]} />
            <meshStandardMaterial 
              color={color}
              emissive={color}
              emissiveIntensity={0.3}
              metalness={0.5}
              roughness={0.3}
            />
          </mesh>
        )
      })}
    </group>
  )
}

function SpectrumHeatmap({ magnitudeHistory, freqBins = HEATMAP_FREQ_BINS }) {
  const planeRef = useRef(null)
  const textureRef = useRef(null)
  const canvasRef = useRef(null)
  
  const historyLength = HEATMAP_HISTORY_LENGTH
  
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = historyLength
    canvas.height = freqBins
    canvasRef.current = canvas
    
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#000033'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    textureRef.current = texture
    
    return () => {
      texture.dispose()
      canvasRef.current = null
    }
  }, [historyLength, freqBins])
  
  useEffect(() => {
    if (!canvasRef.current || !textureRef.current || !magnitudeHistory || magnitudeHistory.length === 0) {
      return
    }
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const imageData = ctx.createImageData(canvas.width, canvas.height)
    const data = imageData.data
    
    const history = magnitudeHistory.slice(-historyLength)
    const startIdx = Math.max(0, historyLength - history.length)
    
    for (let t = 0; t < historyLength; t++) {
      const historyIdx = t - startIdx
      const mags = historyIdx >= 0 ? history[historyIdx] : null
      
      for (let f = 0; f < freqBins; f++) {
        const pixelIdx = ((freqBins - 1 - f) * canvas.width + t) * 4
        
        if (mags && f < mags.length) {
          const normalized = normalizeMagnitude(mags[f])
          const color = viridisColor(normalized)
          
          data[pixelIdx] = Math.floor(color.r * 255)
          data[pixelIdx + 1] = Math.floor(color.g * 255)
          data[pixelIdx + 2] = Math.floor(color.b * 255)
          data[pixelIdx + 3] = 255
        } else {
          data[pixelIdx] = 0
          data[pixelIdx + 1] = 8
          data[pixelIdx + 2] = 51
          data[pixelIdx + 3] = 255
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0)
    textureRef.current.needsUpdate = true
  }, [magnitudeHistory, historyLength, freqBins])
  
  return (
    <group position={[0, 0, 0]}>
      <mesh ref={planeRef} position={[0, 4, -8]}>
        <planeGeometry args={[18, 8]} />
        <meshBasicMaterial 
          map={textureRef.current}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      <lineSegments position={[0, 4, -7.99]}>
        <edgesGeometry args={[new THREE.BoxGeometry(18.1, 8.1, 0.02)]} />
        <lineBasicMaterial color="#4a90d9" linewidth={2} />
      </lineSegments>
    </group>
  )
}

function HeatmapLegend() {
  return (
    <group position={[12, 4, -8]}>
      {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((val, i) => (
        <group key={i} position={[0, -2.5 + i * 1, 0]}>
          <mesh>
            <boxGeometry args={[0.6, 0.8, 0.1]} />
            <meshBasicMaterial color={viridisColor(val)} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function GridFloor() {
  return (
    <group position={[0, -0.1, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial 
          color="#1a1a2e"
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>
      <gridHelper args={[100, 50, '#4a90d9', '#2a4a6a']} position={[0, 0.01, 0]} />
    </group>
  )
}

function Scene({ magnitudes, magnitudeHistory, visualizationMode }) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} color="#ffffff" />
      <pointLight position={[-10, 5, -10]} intensity={0.5} color="#4a90d9" />
      
      {visualizationMode === 'bars' && (
        <SpectrumBars magnitudes={magnitudes} />
      )}
      
      {visualizationMode === 'heatmap' && (
        <SpectrumHeatmap magnitudeHistory={magnitudeHistory} />
      )}
      
      {visualizationMode === 'both' && (
        <>
          <SpectrumBars magnitudes={magnitudes} />
          <SpectrumHeatmap magnitudeHistory={magnitudeHistory} />
        </>
      )}
      
      <GridFloor />
      <OrbitControls 
        enablePan={false}
        minDistance={5}
        maxDistance={40}
        maxPolarAngle={Math.PI / 2 - 0.1}
      />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
    </>
  )
}

function App() {
  const [file, setFile] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [totalFrames, setTotalFrames] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [magnitudes, setMagnitudes] = useState(new Array(BAR_COUNT).fill(-80))
  const [magnitudeHistory, setMagnitudeHistory] = useState([])
  const [allSpectrums, setAllSpectrums] = useState([])
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [audioInfo, setAudioInfo] = useState(null)
  const [error, setError] = useState(null)
  const [isMemoryOptimized, setIsMemoryOptimized] = useState(true)
  const [visualizationMode, setVisualizationMode] = useState('bars')
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  
  const wsRef = useRef(null)
  const spectrumsRef = useRef([])
  const cleanupRef = useRef(false)
  const currentStatusRef = useRef('idle')
  const blobUrlRef = useRef(null)
  
  useEffect(() => {
    currentStatusRef.current = status
  }, [status])
  
  const cleanupAll = useCallback(() => {
    cleanupRef.current = true
    
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null
        wsRef.current.onmessage = null
        wsRef.current.onerror = null
        wsRef.current.onclose = null
        if (wsRef.current.readyState === WebSocket.OPEN || 
            wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close()
        }
      } catch (e) {
        console.warn('WebSocket 清理失败:', e)
      }
      wsRef.current = null
    }
    
    if (blobUrlRef.current) {
      try {
        URL.revokeObjectURL(blobUrlRef.current)
      } catch (e) {
        console.warn('Blob URL 释放失败:', e)
      }
      blobUrlRef.current = null
    }
    
    if (spectrumsRef.current.length > 0) {
      spectrumsRef.current = []
    }
  }, [])
  
  useEffect(() => {
    return () => {
      cleanupAll()
    }
  }, [cleanupAll])
  
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      const ext = selectedFile.name.toLowerCase().split('.').pop()
      if (ext !== 'wav' && ext !== 'mp3') {
        setError('只支持WAV或MP3格式的音频文件')
        return
      }
      setFile(selectedFile)
      setError(null)
    }
  }
  
  const handleUpload = async () => {
    if (!file) {
      setError('请先选择音频文件')
      return
    }
    
    cleanupAll()
    spectrumsRef.current = []
    cleanupRef.current = false
    
    setStatus('uploading')
    setError(null)
    setAllSpectrums([])
    setDownloadUrl(null)
    setMagnitudeHistory([])
    
    const formData = new FormData()
    formData.append('file', file)
    
    try {
      const response = await fetch('/upload', {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail || '上传失败')
      }
      
      const data = await response.json()
      setSessionId(data.session_id)
      setAudioInfo({
        filename: data.filename,
        sampleRate: data.sample_rate,
        duration: data.duration
      })
      setStatus('ready')
    } catch (err) {
      setError(err.message)
      setStatus('idle')
    }
  }
  
  const startAnalysis = useCallback(() => {
    if (!sessionId) return
    
    cleanupAll()
    spectrumsRef.current = []
    cleanupRef.current = false
    
    setStatus('analyzing')
    setProgress(0)
    setCurrentFrame(0)
    setAllSpectrums([])
    setDownloadUrl(null)
    setMagnitudeHistory([])
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/analyze/${sessionId}`
    
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    
    ws.onopen = () => {
      if (cleanupRef.current) {
        ws.close()
        return
      }
      ws.send(JSON.stringify({
        config: {
          fft_size: 1024,
          hop_size: 512
        }
      }))
    }
    
    let frameCount = 0
    
    ws.onmessage = (event) => {
      if (cleanupRef.current) return
      
      try {
        const data = JSON.parse(event.data)
        
        switch (data.type) {
          case 'ready':
            break
          case 'start':
            setTotalFrames(data.total_frames)
            break
          case 'spectrum':
            frameCount++
            setCurrentFrame(data.frame)
            setProgress(Math.round((data.frame / data.total) * 100))
            
            const currentMags = data.data.magnitudes.slice(0, BAR_COUNT)
            setMagnitudes(currentMags)
            
            setMagnitudeHistory(prev => {
              const newHistory = [...prev, currentMags]
              if (newHistory.length > HEATMAP_HISTORY_LENGTH) {
                return newHistory.slice(-HEATMAP_HISTORY_LENGTH)
              }
              return newHistory
            })
            
            if (!isMemoryOptimized) {
              spectrumsRef.current.push({
                frequencies: data.data.frequencies,
                magnitudes: data.data.magnitudes,
                timestamp: data.data.timestamp
              })
            }
            break
          case 'complete':
            if (!isMemoryOptimized) {
              setAllSpectrums([...spectrumsRef.current])
            }
            setDownloadUrl(data.download_url)
            setStatus('complete')
            
            try {
              ws.onopen = null
              ws.onmessage = null
              ws.onerror = null
              ws.onclose = null
              ws.close()
            } catch (e) {
              console.warn('WebSocket 关闭失败:', e)
            }
            wsRef.current = null
            break
          case 'error':
            setError(data.message)
            setStatus('error')
            try {
              ws.close()
            } catch (e) {}
            break
        }
      } catch (e) {
        console.error('消息解析错误:', e)
      }
    }
    
    ws.onerror = () => {
      if (cleanupRef.current) return
      setError('WebSocket连接错误')
      setStatus('error')
    }
    
    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null
      }
    }
  }, [sessionId, isMemoryOptimized, cleanupAll])
  
  const downloadJson = () => {
    if (!downloadUrl) return
    window.location.href = downloadUrl
  }
  
  const downloadLocalJson = () => {
    if (allSpectrums.length === 0) {
      setError('本地缓存未启用，请先禁用内存优化模式')
      return
    }
    
    if (blobUrlRef.current) {
      try {
        URL.revokeObjectURL(blobUrlRef.current)
      } catch (e) {}
    }
    
    const data = {
      filename: audioInfo?.filename || 'audio',
      sample_rate: audioInfo?.sampleRate || 44100,
      fft_size: 1024,
      hop_size: 512,
      spectrums: allSpectrums
    }
    
    try {
      const jsonStr = JSON.stringify(data, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url
      
      const a = document.createElement('a')
      a.href = url
      a.download = `${audioInfo?.filename?.split('.')[0] || 'spectrum'}_local.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      
      setTimeout(() => {
        if (blobUrlRef.current === url) {
          try {
            URL.revokeObjectURL(url)
            blobUrlRef.current = null
          } catch (e) {}
        }
      }, 1000)
    } catch (e) {
      setError('JSON导出失败: ' + e.message)
    }
  }
  
  const generatePdf = async () => {
    if (!sessionId) {
      setError('没有可用的分析数据')
      return
    }
    
    setIsGeneratingPdf(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/report/${sessionId}`)
      
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail || 'PDF生成失败')
      }
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      
      const a = document.createElement('a')
      a.href = url
      a.download = `${audioInfo?.filename?.split('.')[0] || 'spectrum'}_report.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      
      setTimeout(() => {
        window.URL.revokeObjectURL(url)
      }, 1000)
      
    } catch (err) {
      setError('PDF生成失败: ' + err.message)
    } finally {
      setIsGeneratingPdf(false)
    }
  }
  
  const reset = () => {
    cleanupAll()
    
    setFile(null)
    setSessionId(null)
    setStatus('idle')
    setProgress(0)
    setTotalFrames(0)
    setCurrentFrame(0)
    setMagnitudes(new Array(BAR_COUNT).fill(-80))
    setMagnitudeHistory([])
    setAllSpectrums([])
    setDownloadUrl(null)
    setAudioInfo(null)
    setError(null)
    cleanupRef.current = false
    setIsGeneratingPdf(false)
  }
  
  const statusText = {
    'idle': '等待上传',
    'uploading': '上传中...',
    'ready': '准备分析',
    'analyzing': '分析中...',
    'complete': '分析完成',
    'error': '错误'
  }
  
  const modeOptions = [
    { value: 'bars', label: '📊 3D柱状图' },
    { value: 'heatmap', label: '🌡️ 热力图' },
    { value: 'both', label: '🎨 混合模式' }
  ]
  
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🎵 实时音频频谱分析系统</h1>
        <p className="subtitle">Rust + WASM + React + Three.js</p>
      </header>
      
      <main className="main-content">
        <div className="control-panel">
          <div className="section">
            <h2>音频文件</h2>
            <div className="file-input-wrapper">
              <input
                type="file"
                accept=".wav,.mp3,audio/wav,audio/mp3"
                onChange={handleFileChange}
                id="fileInput"
                className="file-input"
              />
              <label htmlFor="fileInput" className="file-label">
                {file ? `📂 ${file.name}` : '📁 选择WAV或MP3文件'}
              </label>
            </div>
            {file && (
              <p className="file-info">文件大小: {(file.size / 1024 / 1024).toFixed(2)} MB</p>
            )}
          </div>
          
          <div className="section">
            <h2>状态</h2>
            <div className={`status-badge status-${status}`}>
              {statusText[status]}
            </div>
            
            {audioInfo && (
              <div className="audio-info">
                <p>🎧 文件名: {audioInfo.filename}</p>
                <p>📊 采样率: {audioInfo.sampleRate} Hz</p>
                <p>⏱️ 时长: {audioInfo.duration.toFixed(2)} 秒</p>
              </div>
            )}
            
            {status === 'analyzing' && (
              <div className="progress-container">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="progress-text">
                  帧: {currentFrame} / {totalFrames} ({progress}%)
                </p>
              </div>
            )}
          </div>
          
          <div className="section">
            <h2>可视化模式</h2>
            <div className="mode-selector">
              {modeOptions.map((option) => (
                <button
                  key={option.value}
                  className={`mode-btn ${visualizationMode === option.value ? 'active' : ''}`}
                  onClick={() => setVisualizationMode(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="setting-hint">
              {visualizationMode === 'bars' && '📊 3D柱状图：实时显示各频率能量'}
              {visualizationMode === 'heatmap' && '🌡️ 热力图：显示时间-频率能量变化'}
              {visualizationMode === 'both' && '🎨 混合模式：同时显示柱状图和热力图'}
            </p>
          </div>
          
          <div className="section">
            <h2>设置</h2>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={isMemoryOptimized}
                onChange={(e) => setIsMemoryOptimized(e.target.checked)}
                disabled={status === 'analyzing'}
              />
              <span>内存优化模式 (推荐)</span>
            </label>
            <p className={`setting-hint ${!isMemoryOptimized ? 'warning' : ''}`}>
              {isMemoryOptimized 
                ? '✓ 不缓存频谱数据，长时间运行更稳定'
                : '⚠ 缓存所有帧数据，可能导致内存增长'
              }
            </p>
          </div>
          
          <div className="section">
            <h2>操作</h2>
            <div className="button-group">
              {status === 'idle' && (
                <button 
                  className="btn btn-primary"
                  onClick={handleUpload}
                  disabled={!file}
                >
                  上传并分析
                </button>
              )}
              
              {status === 'ready' && (
                <button 
                  className="btn btn-primary"
                  onClick={startAnalysis}
                >
                  开始FFT分析
                </button>
              )}
              
              {status === 'complete' && (
                <>
                  <button 
                    className="btn btn-success"
                    onClick={downloadJson}
                  >
                    📥 下载后端JSON
                  </button>
                  {!isMemoryOptimized && (
                    <button 
                      className="btn btn-success"
                      onClick={downloadLocalJson}
                    >
                      💾 下载前端JSON
                    </button>
                  )}
                  <button 
                    className="btn btn-warning"
                    onClick={generatePdf}
                    disabled={isGeneratingPdf}
                  >
                    {isGeneratingPdf ? '⏳ 生成中...' : '📄 导出PDF报告'}
                  </button>
                </>
              )}
              
              {status !== 'idle' && status !== 'analyzing' && (
                <button 
                  className="btn btn-secondary"
                  onClick={reset}
                >
                  🔄 重新开始
                </button>
              )}
            </div>
          </div>
          
          {error && (
            <div className="error-box">
              ❌ {error}
            </div>
          )}
        </div>
        
        <div className="visualization-panel">
          <div className="canvas-wrapper">
            <Canvas
              camera={{ position: [0, 8, 20], fov: 60 }}
              style={{ background: 'transparent' }}
            >
              <Scene 
                magnitudes={magnitudes} 
                magnitudeHistory={magnitudeHistory}
                visualizationMode={visualizationMode}
              />
            </Canvas>
          </div>
          <div className="legend">
            <span>🖱️ 鼠标拖拽旋转</span>
            <span>🔍 滚轮缩放</span>
            <span>📊 当前模式: {modeOptions.find(m => m.value === visualizationMode)?.label}</span>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
