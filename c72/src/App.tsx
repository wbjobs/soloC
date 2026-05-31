import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import QueueManager from './QueueManager';

interface VideoMetadata {
  original_width: number;
  original_height: number;
  display_width: number;
  display_height: number;
  fps: number;
  total_frames: number;
  is_downsampled: boolean;
  downscale_ratio: number;
}

interface FrameTile {
  x: number;
  y: number;
  width: number;
  height: number;
  data: number[];
}

interface Selection {
  startX: number;
  startY: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

type ProcessingStatus = 'idle' | 'processing' | 'completed' | 'cancelled' | 'error' | 'memory_warning';

type TabMode = 'single' | 'batch';

function App() {
  const [activeTab, setActiveTab] = useState<TabMode>('single');
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showMemoryWarning, setShowMemoryWarning] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playIntervalRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const unlisten = listen('processing-update', (event) => {
      const payload = event.payload as any;
      if (payload.Processing) {
        const { current_frame, total_frames } = payload.Processing;
        setProcessingStatus('processing');
        setProgress((current_frame / total_frames) * 100);
        setStatusMessage(`处理中: ${current_frame} / ${total_frames} 帧`);
      } else if (payload === 'Completed') {
        setProcessingStatus('completed');
        setProgress(100);
        setStatusMessage('处理完成！视频已导出');
      } else if (payload === 'Cancelled') {
        setProcessingStatus('cancelled');
        setStatusMessage('处理已取消');
      } else if (payload.MemoryWarning) {
        setProcessingStatus('memory_warning');
        setShowMemoryWarning(true);
        setStatusMessage(`内存警告: 当前使用 ${payload.MemoryWarning.used_mb.toFixed(1)}MB`);
      } else if (payload.Error) {
        setProcessingStatus('error');
        setStatusMessage(`错误: ${payload.Error}`);
      }
    });

    return () => {
      unlisten.then(f => f());
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const forceJsGC = useCallback(() => {
    if (typeof (window as any).gc === 'function') {
      (window as any).gc();
    }
  }, []);

  const handleUpload = async () => {
    try {
      const selected = await open({
        filters: [{
          name: '视频文件',
          extensions: ['mp4', 'avi', 'mov', 'mkv']
        }],
        multiple: false
      });

      if (selected && !Array.isArray(selected)) {
        if (playIntervalRef.current) {
          clearInterval(playIntervalRef.current);
          playIntervalRef.current = null;
        }
        setIsPlaying(false);

        setVideoPath(selected);
        setStatusMessage('正在加载视频...');
        
        const metadata = await invoke<VideoMetadata>('open_video', { path: selected });
        setVideoMetadata(metadata);
        setCurrentFrame(0);
        setSelection(null);
        setProcessingStatus('idle');
        
        if (metadata.is_downsampled) {
          setStatusMessage(`视频已降采样: ${metadata.original_width}x${metadata.original_height} → ${metadata.display_width}x${metadata.display_height} (比例: ${metadata.downscale_ratio.toFixed(3)})`);
        } else {
          setStatusMessage(`视频已加载: ${metadata.display_width}x${metadata.display_height}, ${metadata.fps}fps, ${metadata.total_frames}帧`);
        }
        
        setTimeout(() => loadFrameTiles(0), 100);
      }
    } catch (error) {
      setStatusMessage(`错误: ${error}`);
      setProcessingStatus('error');
    }
  };

  const loadFrameTiles = useCallback(async (frameIndex: number) => {
    if (!videoMetadata) return;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const tiles = await invoke<FrameTile[]>('get_frame_tiles', { frameIndex });
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      canvas.width = videoMetadata.display_width;
      canvas.height = videoMetadata.display_height;

      const imageData = ctx.createImageData(canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        for (let ty = 0; ty < tile.height; ty++) {
          for (let tx = 0; tx < tile.width; tx++) {
            const srcIdx = (ty * tile.width + tx) * 3;
            const dstX = tile.x + tx;
            const dstY = tile.y + ty;
            const dstIdx = (dstY * canvas.width + dstX) * 4;
            
            if (dstIdx + 3 < data.length && srcIdx + 2 < tile.data.length) {
              data[dstIdx] = tile.data[srcIdx];
              data[dstIdx + 1] = tile.data[srcIdx + 1];
              data[dstIdx + 2] = tile.data[srcIdx + 2];
              data[dstIdx + 3] = 255;
            }
          }
        }

        if (i % 4 === 0) {
          forceJsGC();
        }
      }

      ctx.putImageData(imageData, 0, 0);

      (tiles as any) = null;
      (imageData as any) = null;
      forceJsGC();
    } catch (error) {
      console.error('加载帧失败:', error);
    }
  }, [videoMetadata, forceJsGC]);

  useEffect(() => {
    if (videoMetadata) {
      loadFrameTiles(currentFrame);
    }
  }, [currentFrame, videoMetadata, loadFrameTiles]);

  const togglePlay = () => {
    if (isPlaying) {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      setIsPlaying(false);
    } else {
      if (videoMetadata) {
        setIsPlaying(true);
        const intervalMs = Math.max(1000 / videoMetadata.fps, 30);
        playIntervalRef.current = window.setInterval(() => {
          setCurrentFrame(prev => {
            if (prev >= videoMetadata.total_frames - 1) {
              if (playIntervalRef.current) {
                clearInterval(playIntervalRef.current);
                playIntervalRef.current = null;
              }
              setIsPlaying(false);
              return 0;
            }
            return prev + 1;
          });
        }, intervalMs);
      }
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isPlaying) {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      setIsPlaying(false);
    }
    setCurrentFrame(parseInt(e.target.value));
  };

  const getCanvasScale = useCallback(() => {
    if (!canvasRef.current || !videoMetadata) return { x: 1, y: 1 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: videoMetadata.display_width / rect.width,
      y: videoMetadata.display_height / rect.height
    };
  }, [videoMetadata]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPlaying || processingStatus === 'processing') return;
    
    const canvas = canvasRef.current;
    if (!canvas || !videoMetadata) return;

    const rect = canvas.getBoundingClientRect();
    const scale = getCanvasScale();
    
    const x = Math.round((e.clientX - rect.left) * scale.x);
    const y = Math.round((e.clientY - rect.top) * scale.y);

    setIsSelecting(true);
    setSelection({
      startX: x,
      startY: y,
      x,
      y,
      width: 0,
      height: 0
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting || !selection || !videoMetadata) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scale = getCanvasScale();
    
    const x = Math.round((e.clientX - rect.left) * scale.x);
    const y = Math.round((e.clientY - rect.top) * scale.y);

    setSelection(prev => {
      if (!prev) return null;
      
      const newX = Math.min(x, prev.startX);
      const newY = Math.min(y, prev.startY);
      const newWidth = Math.abs(x - prev.startX);
      const newHeight = Math.abs(y - prev.startY);

      return {
        ...prev,
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight
      };
    });
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  const handleSetTarget = async () => {
    if (!selection || selection.width < 10 || selection.height < 10) {
      setStatusMessage('请选择一个有效的目标区域（至少 10x10 像素）');
      return;
    }

    try {
      const targetX = videoMetadata?.is_downsampled 
        ? Math.round(selection.x / videoMetadata.downscale_ratio)
        : selection.x;
      const targetY = videoMetadata?.is_downsampled
        ? Math.round(selection.y / videoMetadata.downscale_ratio)
        : selection.y;
      const targetWidth = videoMetadata?.is_downsampled
        ? Math.round(selection.width / videoMetadata.downscale_ratio)
        : selection.width;
      const targetHeight = videoMetadata?.is_downsampled
        ? Math.round(selection.height / videoMetadata.downscale_ratio)
        : selection.height;

      await invoke('set_target', {
        x: targetX,
        y: targetY,
        width: targetWidth,
        height: targetHeight,
        startFrame: currentFrame
      });
      setStatusMessage(`目标已设置: 位置 (${targetX}, ${targetY}), 大小 ${targetWidth}x${targetHeight}`);
    } catch (error) {
      setStatusMessage(`设置目标失败: ${error}`);
    }
  };

  const handleStartProcessing = async () => {
    if (!selection) {
      setStatusMessage('请先框选追踪目标');
      return;
    }

    try {
      const outputPath = await save({
        filters: [{
          name: 'MP4 视频',
          extensions: ['mp4']
        }]
      });

      if (outputPath) {
        setProcessingStatus('processing');
        setProgress(0);
        await invoke('start_processing', { outputPath });
      }
    } catch (error) {
      setStatusMessage(`开始处理失败: ${error}`);
      setProcessingStatus('error');
    }
  };

  const handleCancelProcessing = async () => {
    try {
      await invoke('cancel_processing');
    } catch (error) {
      setStatusMessage(`取消失败: ${error}`);
    }
  };

  const scale = getCanvasScale();

  return (
    <div className="app">
      <div className="container">
        <header className="app-header">
          <h1>🎯 视频目标追踪与马赛克处理</h1>
          <p>支持 4K/8K 高分辨率视频的内存优化处理</p>
        </header>

        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === 'single' ? 'active' : ''}`}
            onClick={() => setActiveTab('single')}
          >
            🎬 单个视频处理
          </button>
          <button
            className={`tab-btn ${activeTab === 'batch' ? 'active' : ''}`}
            onClick={() => setActiveTab('batch')}
          >
            📋 批量队列处理
          </button>
        </div>

        {activeTab === 'batch' ? (
          <QueueManager />
        ) : (
          <>
        

        <div
          className="upload-section"
          onClick={handleUpload}
        >
          <div className="upload-icon">📹</div>
          <h3>点击上传视频文件</h3>
          <p>支持 MP4, AVI, MOV, MKV 格式</p>
          <p style={{ color: '#00d4ff', marginTop: '10px' }}>
            💡 超过 1080p 的视频将自动降采样以节省内存
          </p>
          <button className="upload-btn">选择视频</button>
        </div>

        {videoMetadata && (
          <div className="video-info">
            <div className="info-item">
              <span>原始分辨率</span>
              <span>{videoMetadata.original_width} × {videoMetadata.original_height}</span>
            </div>
            {videoMetadata.is_downsampled && (
              <div className="info-item" style={{ color: '#ffa500' }}>
                <span>显示分辨率</span>
                <span>{videoMetadata.display_width} × {videoMetadata.display_height}</span>
              </div>
            )}
            <div className="info-item">
              <span>帧率</span>
              <span>{videoMetadata.fps.toFixed(1)} FPS</span>
            </div>
            <div className="info-item">
              <span>总帧数</span>
              <span>{videoMetadata.total_frames}</span>
            </div>
          </div>
        )}

        {videoMetadata && (
          <div className="video-player-section">
            <div className="canvas-container">
              <canvas
                ref={canvasRef}
                className="video-canvas"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
              {selection && selection.width > 0 && (
                <div
                  className="selection-overlay"
                  style={{
                    left: selection.x / scale.x,
                    top: selection.y / scale.y,
                    width: selection.width / scale.x,
                    height: selection.height / scale.y
                  }}
                />
              )}
            </div>

            <div className="controls">
              <button
                className="play-btn"
                onClick={togglePlay}
                disabled={processingStatus === 'processing'}
              >
                {isPlaying ? '⏸ 暂停' : '▶ 播放'}
              </button>
              <input
                type="range"
                className="frame-slider"
                min={0}
                max={videoMetadata.total_frames - 1}
                value={currentFrame}
                onChange={handleSliderChange}
                disabled={processingStatus === 'processing'}
              />
              <span className="frame-info">
                {currentFrame + 1} / {videoMetadata.total_frames}
              </span>
            </div>

            {selection && selection.width > 0 && (
              <div className="target-info">
                <h4>框选目标</h4>
                <p>位置: ({selection.x}, {selection.y}) | 大小: {selection.width} × {selection.height}</p>
                <button
                  className="action-btn"
                  onClick={handleSetTarget}
                  disabled={processingStatus === 'processing'}
                  style={{ marginTop: '10px' }}
                >
                  ✓ 设为追踪目标
                </button>
              </div>
            )}
          </div>
        )}

        {videoMetadata && (
          <div className="processing-section">
            <h3>视频处理</h3>
            
            {processingStatus === 'processing' && (
              <>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="progress-text">{progress.toFixed(1)}%</p>
                <div className="processing-buttons">
                  <button
                    className="cancel-btn"
                    onClick={handleCancelProcessing}
                  >
                    ✕ 取消处理
                  </button>
                </div>
              </>
            )}

            {processingStatus !== 'processing' && (
              <div style={{ textAlign: 'center' }}>
                <button
                  className="action-btn"
                  onClick={handleStartProcessing}
                  disabled={!selection}
                >
                  🚀 开始处理并导出
                </button>
              </div>
            )}

            {statusMessage && (
              <div className={`status-message ${
                processingStatus === 'completed' ? 'success' :
                processingStatus === 'error' ? 'error' :
                processingStatus === 'memory_warning' ? 'warning' : 'info'
              }`}>
                {statusMessage}
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;