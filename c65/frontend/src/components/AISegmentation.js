import React, { useState, useRef, useCallback, useEffect } from 'react';

export function AISegmentationTool({
  studyId,
  currentSlice,
  onSegmentationComplete,
  onSegmentationUpdate
}) {
  const canvasRef = useRef(null);
  const [isDrawingROI, setIsDrawingROI] = useState(false);
  const [roiPoints, setRoiPoints] = useState([]);
  const [selectedOrgan, setSelectedOrgan] = useState('pancreas');
  const [segmentationStatus, setSegmentationStatus] = useState(null);
  const [segmentationResult, setSegmentationResult] = useState(null);
  const [maskOpacity, setMaskOpacity] = useState(0.5);
  const [brushMode, setBrushMode] = useState(null);
  const [brushSize, setBrushSize] = useState(5);
  const [corrections, setCorrections] = useState([]);
  const [pollingId, setPollingId] = useState(null);

  const organOptions = [
    { value: 'pancreas', label: '胰腺' },
    { value: 'liver', label: '肝脏' },
    { value: 'kidney', label: '肾脏' },
    { value: 'spleen', label: '脾脏' },
  ];

  const handleMouseDown = useCallback((e) => {
    if (brushMode) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) / rect.width * 512);
      const y = Math.round((e.clientY - rect.top) / rect.height * 512);
      
      setCorrections(prev => [...prev, {
        type: brushMode,
        point: [x, y, currentSlice],
        radius: brushSize,
        slice_index: currentSlice
      }]);

      drawCorrection(x, y, brushMode);
    } else {
      setIsDrawingROI(true);
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width * 512;
      const y = (e.clientY - rect.top) / rect.height * 512;
      setRoiPoints([[x, y, currentSlice]]);
    }
  }, [brushMode, currentSlice, brushSize]);

  const handleMouseMove = useCallback((e) => {
    if (isDrawingROI) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width * 512;
      const y = (e.clientY - rect.top) / rect.height * 512;
      setRoiPoints(prev => [...prev, [x, y, currentSlice]]);
      drawROI();
    } else if (brushMode && e.buttons === 1) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) / rect.width * 512);
      const y = Math.round((e.clientY - rect.top) / rect.height * 512);
      
      setCorrections(prev => [...prev, {
        type: brushMode,
        point: [x, y, currentSlice],
        radius: brushSize,
        slice_index: currentSlice
      }]);

      drawCorrection(x, y, brushMode);
    }
  }, [isDrawingROI, currentSlice, brushMode]);

  const handleMouseUp = useCallback(() => {
    if (isDrawingROI) {
      setIsDrawingROI(false);
      drawROI();
    }
  }, [isDrawingROI]);

  const drawROI = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || roiPoints.length < 2) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (segmentationResult?.contours) {
      drawContours(ctx, segmentationResult.contours);
    }

    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(roiPoints[0][0], roiPoints[0][1]);
    roiPoints.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }, [roiPoints, segmentationResult]);

  const drawContours = (ctx, contours) => {
    ctx.strokeStyle = '#FF00FF';
    ctx.lineWidth = 2;
    ctx.fillStyle = `rgba(255, 0, 255, ${maskOpacity})`;

    contours.forEach(contour => {
      if (contour.length > 0 && contour[0][2] === currentSlice) {
        ctx.beginPath();
        ctx.moveTo(contour[0][0], contour[0][1]);
        contour.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    });
  };

  const drawCorrection = (x, y, mode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = mode === 'add' ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.arc(x, y, brushSize, 0, Math.PI * 2);
    ctx.fill();
  };

  const clearROI = () => {
    setRoiPoints([]);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const startSegmentation = async () => {
    try {
      setSegmentationStatus('processing');
      
      const response = await fetch('/api/ai-segmentation/segment/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          study_id: studyId,
          organ_type: selectedOrgan,
          roi_points: roiPoints
        })
      });

      const data = await response.json();
      setPollingId(data.id);
      
      pollSegmentationStatus(data.id);
    } catch (error) {
      console.error('Segmentation failed:', error);
      setSegmentationStatus('failed');
    }
  };

  const pollSegmentationStatus = async (id) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/ai-segmentation/${id}/`);
        const data = await response.json();
        
        setSegmentationStatus(data.status);
        
        if (data.status === 'completed') {
          setSegmentationResult(data);
          if (onSegmentationComplete) {
            onSegmentationComplete(data);
          }
        } else if (data.status === 'failed') {
          console.error('Segmentation failed:', data.error_message);
        } else if (['pending', 'processing'].includes(data.status)) {
          setTimeout(poll, 1000);
        }
      } catch (error) {
        console.error('Polling failed:', error);
      }
    };
    
    poll();
  };

  const acceptSegmentation = async () => {
    if (!pollingId) return;
    
    try {
      await fetch(`/api/ai-segmentation/${pollingId}/update_status/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept' })
      });
      setSegmentationStatus('accepted');
    } catch (error) {
      console.error('Failed to accept segmentation:', error);
    }
  };

  const rejectSegmentation = async () => {
    if (!pollingId) return;
    
    try {
      await fetch(`/api/ai-segmentation/${pollingId}/update_status/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' })
      });
      setSegmentationResult(null);
      setSegmentationStatus(null);
      clearROI();
    } catch (error) {
      console.error('Failed to reject segmentation:', error);
    }
  };

  const applyCorrections = async () => {
    if (!pollingId || corrections.length === 0) return;
    
    try {
      setSegmentationStatus('processing');
      
      const response = await fetch(`/api/ai-segmentation/${pollingId}/update_status/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refine',
          corrections: corrections.map(c => ({
            type: c.type,
            point: c.point,
            radius: c.radius,
            slice_index: c.slice_index
          }))
        })
      });

      const data = await response.json();
      
      if (data.status === 'refined') {
        setSegmentationResult(data.segmentation);
        setPollingId(data.segmentation.id);
        setSegmentationStatus('completed');
        setCorrections([]);
        
        if (onSegmentationUpdate) {
          onSegmentationUpdate(data.segmentation);
        }
      }
    } catch (error) {
      console.error('Failed to apply corrections:', error);
      setSegmentationStatus('completed');
    }
  };

  const regenerateSegmentation = async () => {
    if (!pollingId) return;
    
    try {
      setSegmentationStatus('processing');
      
      const response = await fetch(`/api/ai-segmentation/${pollingId}/update_status/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate' })
      });

      const data = await response.json();
      pollSegmentationStatus(data.segmentation.id);
    } catch (error) {
      console.error('Failed to regenerate segmentation:', error);
    }
  };

  useEffect(() => {
    return () => {
      if (segmentationResult?.contours) {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          drawContours(ctx, segmentationResult.contours);
        }
      }
    };
  }, [currentSlice, segmentationResult, maskOpacity]);

  return (
    <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
      <h3>AI 预分割 - Human-in-the-Loop</h3>
      
      <div style={{ marginBottom: '15px' }}>
        <label style={{ marginRight: '10px' }}>目标器官：</label>
        <select
          value={selectedOrgan}
          onChange={(e) => setSelectedOrgan(e.target.value)}
          disabled={segmentationStatus === 'processing'}
        >
          {organOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div style={{ position: 'relative', marginBottom: '15px' }}>
        <canvas
          ref={canvasRef}
          width={512}
          height={512}
          style={{
            border: '1px solid #000',
            cursor: brushMode ? 'crosshair' : (isDrawingROI ? 'crosshair' : 'default'),
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 10,
            pointerEvents: 'auto'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        <div style={{ height: '512px' }}></div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <p>操作模式：</p>
        <button
          onClick={() => setBrushMode(null)}
          style={{
            marginRight: '10px',
            padding: '8px 16px',
            backgroundColor: !brushMode ? '#007bff' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          绘制 ROI
        </button>
        <button
          onClick={() => setBrushMode('add')}
          style={{
            marginRight: '10px',
            padding: '8px 16px',
            backgroundColor: brushMode === 'add' ? '#28a745' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          添加区域
        </button>
        <button
          onClick={() => setBrushMode('remove')}
          style={{
            padding: '8px 16px',
            backgroundColor: brushMode === 'remove' ? '#dc3545' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          移除区域
        </button>
      </div>

      {brushMode && (
        <div style={{ marginBottom: '15px' }}>
          <label>笔刷大小：</label>
          <input
            type="range"
            min="1"
            max="20"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
          />
          <span>{brushSize}</span>
        </div>
      )}

      <div style={{ marginBottom: '15px' }}>
        <label>遮罩透明度：</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={maskOpacity}
          onChange={(e) => setMaskOpacity(parseFloat(e.target.value))}
        />
        <span>{Math.round(maskOpacity * 100)}%</span>
      </div>

      {segmentationStatus && (
        <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          <p>
            <strong>状态：</strong>
            {segmentationStatus === 'pending' && '等待中...'}
            {segmentationStatus === 'processing' && '处理中...'}
            {segmentationStatus === 'completed' && `已完成 (置信度：${(segmentationResult?.confidence * 100).toFixed(1)}%)`}
            {segmentationStatus === 'accepted' && '已接受'}
            {segmentationStatus === 'failed' && '失败'}
          </p>
          {segmentationResult?.processing_time && (
            <p><strong>处理时间：</strong>{segmentationResult.processing_time.toFixed(2)} 秒</p>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {!segmentationStatus || segmentationStatus === 'failed' ? (
          <>
            <button
              onClick={clearROI}
              style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              清除 ROI
            </button>
            <button
              onClick={startSegmentation}
              disabled={roiPoints.length < 3}
              style={{
                padding: '10px 20px',
                backgroundColor: roiPoints.length >= 3 ? '#007bff' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: roiPoints.length >= 3 ? 'pointer' : 'not-allowed'
              }}
            >
              开始 AI 分割
            </button>
          </>
        ) : segmentationStatus === 'processing' ? (
          <p style={{ color: '#007bff' }}>AI 正在处理中，请稍候...</p>
        ) : segmentationStatus === 'completed' ? (
          <>
            <button
              onClick={acceptSegmentation}
              style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              ✓ 接受分割结果
            </button>
            <button
              onClick={applyCorrections}
              disabled={corrections.length === 0}
              style={{
                padding: '10px 20px',
                backgroundColor: corrections.length > 0 ? '#ffc107' : '#ccc',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: corrections.length > 0 ? 'pointer' : 'not-allowed'
              }}
            >
              应用修正 ({corrections.length})
            </button>
            <button
              onClick={regenerateSegmentation}
              style={{ padding: '10px 20px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              🔄 重新生成
            </button>
            <button
              onClick={rejectSegmentation}
              style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              ✗ 放弃
            </button>
          </>
        ) : segmentationStatus === 'accepted' ? (
          <p style={{ color: '#28a745', fontWeight: 'bold' }}>✓ 分割结果已接受</p>
        ) : null}
      </div>

      {roiPoints.length > 0 && !segmentationStatus && (
        <p style={{ marginTop: '15px', color: '#666' }}>
          ROI 已选择 {roiPoints.length} 个点。点击"开始 AI 分割"进行分割。
        </p>
      )}
    </div>
  );
}

export default AISegmentationTool;
