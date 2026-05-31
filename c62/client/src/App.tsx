import { useState, useRef, useEffect, useCallback } from 'react'
import { Region, VideoInfo } from './types'
import { tracker, TrackPoint, TrackResult } from './tracker'

const CANVAS_MEMORY_LIMIT = 3840 * 2160 * 4;
const SUBTITLE_OFFSET_SECONDS = 2;

function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string>('')
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [regions, setRegions] = useState<Region[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingMode, setDrawingMode] = useState(false)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [regionStartTime, setRegionStartTime] = useState<number | null>(null)
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false)
  const [opencvReady, setOpencvReady] = useState(false)
  const [isTracking, setIsTracking] = useState(false)
  const [trackingProgress, setTrackingProgress] = useState(0)
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([])
  const [selectedTrackPoint, setSelectedTrackPoint] = useState<number | null>(null)
  const [isAdjustingTrack, setIsAdjustingTrack] = useState(false)
  const [trackEndTime, setTrackEndTime] = useState<number | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>(0)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl)
      }
      setRegions([])
      setCurrentTime(0)
      setIsPlaying(false)
      setVideoFile(file)
      const url = URL.createObjectURL(file)
      setVideoUrl(url)
    }
  }

  const handleVideoLoaded = useCallback(() => {
    const video = videoRef.current
    if (video) {
      setVideoInfo({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        fps: 30
      })
    }
  }, [])

  useEffect(() => {
    tracker.init().then(ready => {
      setOpencvReady(ready)
      console.log('OpenCV ready:', ready)
    })
  }, [])

  const startTracking = async () => {
    const video = videoRef.current
    if (!video || !currentRect || !videoInfo) return

    setIsTracking(true)
    setTrackingProgress(0)
    setIsPlaying(false)

    const displayWidth = Math.min(videoInfo.width, 1200)
    const displayHeight = (displayWidth / videoInfo.width) * videoInfo.height
    const scaleX = videoInfo.width / displayWidth
    const scaleY = videoInfo.height / displayHeight

    const actualRect = {
      x: Math.round(currentRect.x * scaleX),
      y: Math.round(currentRect.y * scaleY),
      width: Math.round(currentRect.width * scaleX),
      height: Math.round(currentRect.height * scaleY)
    }

    const endTime = trackEndTime || videoInfo.duration

    try {
      const result: TrackResult = await tracker.trackObject(
        video,
        actualRect,
        currentTime,
        endTime,
        6,
        (progress) => setTrackingProgress(progress)
      )

      setTrackPoints(result.points)
      setRegions(prev => [...prev, ...result.regions])
      setCurrentRect(null)
      setDrawingMode(false)
      setDrawStart(null)
      setRegionStartTime(null)
      setTrackEndTime(null)
    } catch (error) {
      console.error('Tracking error:', error)
      alert('追踪失败: ' + (error as Error).message)
    } finally {
      setIsTracking(false)
      setTrackingProgress(0)
    }
  }

  const adjustTrackPoint = (index: number, newPosition: { x: number; y: number; width?: number; height?: number }) => {
    setTrackPoints(prev => {
      const newPoints = [...prev]
      newPoints[index] = {
        ...newPoints[index],
        ...newPosition,
        isKeyFrame: true
      }

      if (index > 0) {
        const prevPoint = newPoints[index - 1]
        const current = newPoints[index]
        const timeDiff = current.time - prevPoint.time
        const steps = Math.max(1, Math.floor(timeDiff * 30))
        
        for (let i = 1; i < steps; i++) {
          const t = i / steps
          const interpolateIndex = index - steps + i
          if (interpolateIndex > 0 && interpolateIndex < index) {
            newPoints[interpolateIndex] = {
              ...newPoints[interpolateIndex],
              x: Math.round(prevPoint.x + (current.x - prevPoint.x) * t),
              y: Math.round(prevPoint.y + (current.y - prevPoint.y) * t),
              width: Math.round(prevPoint.width + (current.width - prevPoint.width) * t),
              height: Math.round(prevPoint.height + (current.height - prevPoint.height) * t),
              isKeyFrame: false
            }
          }
        }
      }

      return newPoints
    })

    setRegions(prev => {
      const newRegions = trackPoints.map((point, idx) => ({
        id: `adjusted_${Date.now()}_${idx}`,
        x: point.x,
        y: point.y,
        width: point.width,
        height: point.height,
        startTime: point.time,
        endTime: idx < trackPoints.length - 1 ? trackPoints[idx + 1].time : videoInfo!.duration
      }))
      const oldRegions = prev.filter(r => !r.id.startsWith('tracked_') && !r.id.startsWith('adjusted_'))
      return [...oldRegions, ...newRegions]
    })
  }

  const clearTracking = () => {
    setTrackPoints([])
    setSelectedTrackPoint(null)
    setTrackEndTime(null)
    setRegions(prev => prev.filter(r => !r.id.startsWith('tracked_') && !r.id.startsWith('adjusted_')))
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d', { willReadFrequently: false })
    if (!ctx) return

    let lastTime = 0
    const frameInterval = 1000 / 30

    const renderFrame = (timestamp: number) => {
      if (timestamp - lastTime < frameInterval) {
        if (isPlaying) {
          animationRef.current = requestAnimationFrame(renderFrame)
        }
        return
      }
      lastTime = timestamp

      const displayWidth = Math.min(videoInfo?.width || 1920, 1200)
      const displayHeight = videoInfo ? (displayWidth / videoInfo.width) * videoInfo.height : 675
      
      if (canvas.width !== Math.floor(displayWidth) || canvas.height !== Math.floor(displayHeight)) {
        canvas.width = Math.floor(displayWidth)
        canvas.height = Math.floor(displayHeight)
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const scaleX = canvas.width / (videoInfo?.width || 1920)
      const scaleY = canvas.height / (videoInfo?.height || 1080)

      if (trackPoints.length > 1) {
        ctx.strokeStyle = 'rgba(255, 193, 7, 0.6)'
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        trackPoints.forEach((point, i) => {
          const px = (point.x + point.width / 2) * scaleX
          const py = (point.y + point.height / 2) * scaleY
          if (i === 0) {
            ctx.moveTo(px, py)
          } else {
            ctx.lineTo(px, py)
          }
        })
        ctx.stroke()
        ctx.setLineDash([])
      }

      trackPoints.forEach((point, index) => {
        const px = (point.x + point.width / 2) * scaleX
        const py = (point.y + point.height / 2) * scaleY
        
        ctx.fillStyle = point.isKeyFrame ? '#ffc107' : 'rgba(255, 193, 7, 0.5)'
        ctx.beginPath()
        ctx.arc(px, py, point.isKeyFrame ? 6 : 4, 0, Math.PI * 2)
        ctx.fill()

        if (selectedTrackPoint === index) {
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(px, py, 10, 0, Math.PI * 2)
          ctx.stroke()
          
          ctx.strokeStyle = '#ffc107'
          ctx.lineWidth = 3
          ctx.strokeRect(
            point.x * scaleX,
            point.y * scaleY,
            point.width * scaleX,
            point.height * scaleY
          )
        }
      })

      ctx.strokeStyle = '#4ecdc4'
      ctx.lineWidth = 2
      regions.forEach(region => {
        if (currentTime >= region.startTime && currentTime <= region.endTime) {
          ctx.strokeRect(
            region.x * scaleX,
            region.y * scaleY,
            region.width * scaleX,
            region.height * scaleY
          )
        }
      })

      if (currentRect) {
        ctx.strokeStyle = '#e94560'
        ctx.lineWidth = 3
        ctx.strokeRect(currentRect.x, currentRect.y, currentRect.width, currentRect.height)
      }

      if (isPlaying) {
        setCurrentTime(video.currentTime)
        animationRef.current = requestAnimationFrame(renderFrame)
      }
    }

    animationRef.current = requestAnimationFrame(renderFrame)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [isPlaying, regions, currentRect, videoInfo, currentTime])

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl)
      }
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
        canvas.width = 1
        canvas.height = 1
      }
    }
  }, [])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
    } else {
      video.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !videoInfo) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const scaleX = canvas.width / videoInfo.width
    const scaleY = canvas.height / videoInfo.height

    if (trackPoints.length > 0 && selectedTrackPoint !== null) {
      setIsAdjustingTrack(true)
      return
    }

    for (let i = trackPoints.length - 1; i >= 0; i--) {
      const point = trackPoints[i]
      const px = (point.x + point.width / 2) * scaleX
      const py = (point.y + point.height / 2) * scaleY
      const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2)
      
      if (distance < 15 && point.isKeyFrame) {
        setSelectedTrackPoint(i)
        setIsAdjustingTrack(true)
        return
      }
    }

    if (!drawingMode) return
    
    setIsDrawing(true)
    setDrawStart({ x, y })
    setRegionStartTime(currentTime)
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !videoInfo) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (isAdjustingTrack && selectedTrackPoint !== null) {
      const scaleX = canvas.width / videoInfo.width
      const scaleY = canvas.height / videoInfo.height
      
      const point = trackPoints[selectedTrackPoint]
      const newX = Math.max(0, Math.min(videoInfo.width - point.width, Math.round((x - point.width * scaleX / 2) / scaleX)))
      const newY = Math.max(0, Math.min(videoInfo.height - point.height, Math.round((y - point.height * scaleY / 2) / scaleY)))
      
      adjustTrackPoint(selectedTrackPoint, { x: newX, y: newY, width: point.width, height: point.height })
      return
    }

    if (!isDrawing || !drawStart) return

    const width = x - drawStart.x
    const height = y - drawStart.y

    setCurrentRect({
      x: width >= 0 ? drawStart.x : x,
      y: height >= 0 ? drawStart.y : y,
      width: Math.abs(width),
      height: Math.abs(height)
    })
  }

  const handleCanvasMouseUp = () => {
    if (isAdjustingTrack) {
      setIsAdjustingTrack(false)
      return
    }

    if (!isDrawing || !currentRect || !videoInfo || regionStartTime === null) {
      setIsDrawing(false)
      setCurrentRect(null)
      return
    }

    const displayWidth = Math.min(videoInfo.width, 1200)
    const displayHeight = (displayWidth / videoInfo.width) * videoInfo.height
    const scaleX = videoInfo.width / displayWidth
    const scaleY = videoInfo.height / displayHeight

    const newRegion: Region = {
      id: Date.now().toString(),
      x: Math.round(currentRect.x * scaleX),
      y: Math.round(currentRect.y * scaleY),
      width: Math.round(currentRect.width * scaleX),
      height: Math.round(currentRect.height * scaleY),
      startTime: regionStartTime,
      endTime: currentTime,
      subtitleOffset: SUBTITLE_OFFSET_SECONDS
    }

    setRegions(prev => [...prev, newRegion])
    setIsDrawing(false)
    setCurrentRect(null)
    setDrawStart(null)
    setRegionStartTime(null)
  }

  const setVideoTime = (clientX: number) => {
    const video = videoRef.current
    if (!video || !videoInfo || !timelineRef.current) return

    const rect = timelineRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    const newTime = percentage * videoInfo.duration

    video.currentTime = newTime
    setCurrentTime(newTime)
  }

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDraggingTimeline(true)
    setVideoTime(e.clientX)
  }

  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingTimeline) return
    setVideoTime(e.clientX)
  }

  const handleTimelineMouseUp = () => {
    setIsDraggingTimeline(false)
  }

  const deleteRegion = (id: string) => {
    setRegions(prev => prev.filter(r => r.id !== id))
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  const exportVideo = async () => {
    if (!videoFile || regions.length === 0) return

    setIsExporting(true)
    setExportProgress(0)

    try {
      const formData = new FormData()
      formData.append('video', videoFile)
      formData.append('regions', JSON.stringify(regions))
      formData.append('videoInfo', JSON.stringify(videoInfo))

      setExportProgress(10)

      const response = await fetch('/api/export', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Export failed')
      }

      setExportProgress(90)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'video_with_subtitles.mp4'
      a.click()
      
      setTimeout(() => {
        URL.revokeObjectURL(url)
        if ('stream' in blob) {
          try {
            (blob as any).stream().cancel()
          } catch (e) {}
        }
      }, 1000)

      setExportProgress(100)
      alert('导出成功！视频已下载')

    } catch (error) {
      console.error('Export error:', error)
      alert(`导出失败: ${error.message || '未知错误'}\n请确保 FFmpeg 已正确安装并在系统 PATH 中`)
    } finally {
      setTimeout(() => {
        setIsExporting(false)
        setExportProgress(0)
      }, 1000)
    }
  }

  return (
    <div className="app">
      <div className="header">
        <h1>🎬 视频字幕编辑器</h1>
        <p>上传视频，在时间轴上绘制区域，生成字幕</p>
      </div>

      <div className="upload-section">
        <input
          type="file"
          accept="video/*"
          onChange={handleFileUpload}
          id="video-upload"
        />
        <label htmlFor="video-upload" className="upload-label">
          📁 上传视频文件
        </label>
        {videoFile && (
          <div className="video-info">
            已选择: {videoFile.name}
          </div>
        )}
      </div>

      {videoUrl && (
        <>
          <div className="editor-section">
            <div className="canvas-container">
              <canvas
                ref={canvasRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
              />
            </div>
            
            <div className="controls">
              <button className="btn btn-primary" onClick={togglePlay}>
                {isPlaying ? '⏸ 暂停' : '▶ 播放'}
              </button>
              <button 
                className={`btn ${drawingMode ? 'btn-secondary' : 'btn-success'}`}
                onClick={() => {
                  setDrawingMode(!drawingMode)
                  if (drawingMode) {
                    setSelectedTrackPoint(null)
                    setTrackEndTime(null)
                  }
                }}
              >
                {drawingMode ? '✖ 取消绘制' : '✏ 开始绘制'}
              </button>
              <span className="time-display">
                {formatTime(currentTime)} / {formatTime(videoInfo?.duration || 0)}
              </span>
              {drawingMode && <span className="drawing-mode">绘制模式已开启</span>}
            </div>

            {drawingMode && currentRect && opencvReady && (
              <div className="tracking-controls">
                <div className="tracking-end-time">
                  <label>追踪结束时间:</label>
                  <input
                    type="number"
                    min={currentTime}
                    max={videoInfo?.duration || 0}
                    step={0.1}
                    value={trackEndTime || videoInfo?.duration || 0}
                    onChange={(e) => setTrackEndTime(parseFloat(e.target.value))}
                    style={{ width: '80px', marginLeft: '10px' }}
                  />
                  <span>秒</span>
                </div>
                <button 
                  className="btn btn-tracking"
                  onClick={startTracking}
                  disabled={isTracking}
                >
                  {isTracking ? `追踪中 ${Math.round(trackingProgress)}%` : '🎯 AI 智能追踪'}
                </button>
              </div>
            )}

            {trackPoints.length > 0 && (
              <div className="tracking-info">
                <span>已追踪 {trackPoints.length} 个关键点 | 点击黄色圆点可微调位置</span>
                <button className="btn btn-small" onClick={clearTracking}>清除轨迹</button>
              </div>
            )}
          </div>

          <div className="timeline-section">
            <h3>📊 时间轴 (可拖拽)</h3>
            <div 
              ref={timelineRef}
              className="timeline" 
              onMouseDown={handleTimelineMouseDown}
              onMouseMove={handleTimelineMouseMove}
              onMouseUp={handleTimelineMouseUp}
              onMouseLeave={handleTimelineMouseUp}
              style={{ cursor: isDraggingTimeline ? 'grabbing' : 'pointer' }}
            >
              <div 
                className="timeline-progress" 
                style={{ width: `${(currentTime / (videoInfo?.duration || 1)) * 100}%` }}
              />
              <div 
                className="timeline-cursor" 
                style={{ left: `${(currentTime / (videoInfo?.duration || 1)) * 100}%` }}
              />
              <div className="timeline-markers">
                {regions.map(region => (
                  <div
                    key={region.id}
                    className="marker"
                    style={{
                      left: `${((region.startTime + region.endTime) / 2 / (videoInfo?.duration || 1)) * 100}%`
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="regions-list">
              <h4>已绘制区域 ({regions.length})</h4>
              {regions.map((region, index) => (
                <div key={region.id} className="region-item">
                  <div className="region-info">
                    <span>区域 {index + 1}</span>
                    {' | 位置: '}({region.x}, {region.y}) 
                    {' | 大小: '}{region.width}×{region.height}
                    {' | 时间: '}{formatTime(region.startTime)} - {formatTime(region.endTime)}
                  </div>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '5px 10px', fontSize: '12px' }}
                    onClick={() => deleteRegion(region.id)}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="export-section">
            <h3>🚀 导出视频</h3>
            <button 
              className="btn btn-success"
              onClick={exportVideo}
              disabled={isExporting || regions.length === 0}
              style={{ fontSize: '16px', padding: '15px 40px' }}
            >
              {isExporting ? '导出中...' : '开始导出'}
            </button>
            {isExporting && (
              <div className="progress">
                <div className="progress-bar" style={{ width: `${exportProgress}%` }} />
                <p>正在处理，请稍候...</p>
              </div>
            )}
          </div>
        </>
      )}

      <video
        ref={videoRef}
        src={videoUrl}
        onLoadedMetadata={handleVideoLoaded}
        style={{ display: 'none' }}
        crossOrigin="anonymous"
      />
    </div>
  )
}

export default App
