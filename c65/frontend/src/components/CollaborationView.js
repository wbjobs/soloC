import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WebRTCManager } from '../utils/webrtcDataChannel';
import { ProgressiveVolumeLoader, WindowLevelController } from '../utils/progressiveLoader';
import { AnnotationTool, CommentPanel } from './AnnotationTool';
import { AISegmentationTool } from './AISegmentation';

export function CollaborationView({ studyId, sessionId, isHost = false }) {
  const [webrtcManager, setWebrtcManager] = useState(null);
  const [wsConnection, setWsConnection] = useState(null);
  const [sequence, setSequence] = useState(0);
  const [currentSlice, setCurrentSlice] = useState(0);
  const [totalSlices, setTotalSlices] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [annotations, setAnnotations] = useState([]);
  const [comments, setComments] = useState([]);
  const [windowWidth, setWindowWidth] = useState(2000);
  const [windowCenter, setWindowCenter] = useState(1000);
  const [isConnected, setIsConnected] = useState(false);
  const [remoteSdp, setRemoteSdp] = useState('');
  const [localSdp, setLocalSdp] = useState('');
  const [showAITool, setShowAITool] = useState(false);
  const [aiSegmentation, setAiSegmentation] = useState(null);

  const viewportRef = useRef(null);
  const volumeLoaderRef = useRef(null);
  const windowLevelControllerRef = useRef(null);

  useEffect(() => {
    const wsUrl = `ws://${window.location.host}/ws/collab/${sessionId}/`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    };

    setWsConnection(ws);

    return () => {
      ws.close();
    };
  }, [sessionId]);

  const handleWebSocketMessage = useCallback((data) => {
    switch (data.type) {
      case 'connection_established':
        console.log('Connection established');
        break;
      case 'annotation_update':
        if (data.sequence > sequence) {
          setSequence(data.sequence);
          if (data.annotation) {
            setAnnotations(prev => [...prev, data.annotation]);
          }
          if (data.slice !== undefined) {
            setCurrentSlice(data.slice);
          }
          if (data.windowWidth && data.windowCenter) {
            setWindowWidth(data.windowWidth);
            setWindowCenter(data.windowCenter);
          }
        }
        break;
      case 'webrtc_offer':
        handleWebRTCOffer(data.offer);
        break;
      case 'webrtc_answer':
        handleWebRTCAnswer(data.answer);
        break;
      case 'ice_candidate':
        handleIceCandidate(data.candidate);
        break;
      case 'comment_added':
        setComments(prev => [...prev, data.comment]);
        break;
      default:
        break;
    }
  }, [sequence]);

  const initWebRTC = useCallback(async () => {
    const manager = new WebRTCManager();

    manager.onIceCandidate = (candidate) => {
      if (wsConnection) {
        wsConnection.send(JSON.stringify({
          type: 'ice_candidate',
          candidate
        }));
      }
    };

    manager.onMessage((message) => {
      console.log('Received WebRTC message:', message);
    });

    setWebrtcManager(manager);

    if (isHost) {
      const offer = await manager.createOffer();
      setLocalSdp(JSON.stringify(offer));
      if (wsConnection) {
        wsConnection.send(JSON.stringify({
          type: 'webrtc_offer',
          offer
        }));
      }
    }
  }, [isHost, wsConnection]);

  const handleWebRTCOffer = async (offer) => {
    if (webrtcManager) {
      const answer = await webrtcManager.createAnswer(offer);
      setLocalSdp(JSON.stringify(answer));
      if (wsConnection) {
        wsConnection.send(JSON.stringify({
          type: 'webrtc_answer',
          answer
        }));
      }
    }
  };

  const handleWebRTCAnswer = async (answer) => {
    if (webrtcManager) {
      await webrtcManager.setRemoteDescription(answer);
    }
  };

  const handleIceCandidate = async (candidate) => {
    if (webrtcManager) {
      await webrtcManager.addIceCandidate(candidate);
    }
  };

  const joinWithRemoteSdp = async () => {
    if (webrtcManager && remoteSdp) {
      try {
        const sdp = JSON.parse(remoteSdp);
        if (isHost) {
          await webrtcManager.setRemoteDescription(sdp);
        } else {
          const answer = await webrtcManager.createAnswer(sdp);
          setLocalSdp(JSON.stringify(answer));
        }
      } catch (e) {
        console.error('Failed to parse SDP:', e);
      }
    }
  };

  useEffect(() => {
    const loadStudy = async () => {
      const response = await fetch(`/api/studies/${studyId}/`);
      const studyData = await response.json();
      setTotalSlices(studyData.slices_count);

      const loader = new ProgressiveVolumeLoader(studyId, {
        onSliceLoaded: (index, data) => {
          setLoadingProgress(loader.getProgress());
        }
      });
      await loader.init(studyData);
      volumeLoaderRef.current = loader;
    };

    loadStudy();
  }, [studyId]);

  const sendAnnotationUpdate = useCallback((annotationData) => {
    const newSequence = sequence + 1;
    setSequence(newSequence);

    const message = {
      type: 'annotation_update',
      sequence: newSequence,
      ...annotationData
    };

    if (wsConnection) {
      wsConnection.send(JSON.stringify(message));
    }

    if (webrtcManager) {
      webrtcManager.send(message);
    }
  }, [sequence, wsConnection, webrtcManager]);

  const handleAnnotation = useCallback((points) => {
    const annotation = {
      id: Date.now(),
      points,
      color: '#FF0000',
      slice: currentSlice,
      timestamp: Date.now()
    };

    setAnnotations(prev => [...prev, annotation]);
    sendAnnotationUpdate({ annotation });
  }, [currentSlice, sendAnnotationUpdate]);

  const handleSliceChange = useCallback((newSlice) => {
    setCurrentSlice(newSlice);
    if (volumeLoaderRef.current) {
      volumeLoaderRef.current.setCurrentSlice(newSlice);
    }
    sendAnnotationUpdate({ slice: newSlice });
  }, [sendAnnotationUpdate]);

  const handleWindowLevelChange = useCallback((width, center) => {
    setWindowWidth(width);
    setWindowCenter(center);
    if (windowLevelControllerRef.current) {
      windowLevelControllerRef.current.setWindowLevel(width, center);
    }
    sendAnnotationUpdate({ windowWidth: width, windowCenter: center });
  }, [sendAnnotationUpdate]);

  const handleAddComment = useCallback((text) => {
    const comment = {
      text,
      createdAt: new Date().toISOString(),
      annotationId: annotations.length > 0 ? annotations[annotations.length - 1].id : null
    };
    setComments(prev => [...prev, comment]);
    sendAnnotationUpdate({ comment });
  }, [annotations, sendAnnotationUpdate]);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ flex: 1, padding: 20 }}>
        <h2>Collaboration Session: {sessionId}</h2>
        <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
        <p>Role: {isHost ? 'Host (Surgeon)' : 'Assistant'}</p>

        {!webrtcManager ? (
          <div>
            <button onClick={initWebRTC}>
              {isHost ? 'Start WebRTC Session' : 'Join WebRTC Session'}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ margin: '10px 0' }}>
              <p>WebRTC Status: {webrtcManager.peerConnection?.connectionState}</p>
              {localSdp && (
                <div>
                  <p>Your SDP (send to peer):</p>
                  <textarea
                    value={localSdp}
                    readOnly
                    style={{ width: '100%', height: 100 }}
                  />
                </div>
              )}
              {!isHost && (
                <div>
                  <p>Enter Host SDP:</p>
                  <textarea
                    value={remoteSdp}
                    onChange={(e) => setRemoteSdp(e.target.value)}
                    style={{ width: '100%', height: 100 }}
                  />
                  <button onClick={joinWithRemoteSdp}>Join</button>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <button
              onClick={() => setShowAITool(!showAITool)}
              style={{
                padding: '10px 20px',
                backgroundColor: showAITool ? '#28a745' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {showAITool ? '← 返回标注' : '🤖 AI 预分割'}
            </button>
            {aiSegmentation && (
              <span style={{ padding: '10px', color: '#28a745' }}>
                ✓ AI 分割已完成
              </span>
            )}
          </div>

          <h3>DICOM Viewer</h3>
          
          {showAITool ? (
            <AISegmentationTool
              studyId={studyId}
              currentSlice={currentSlice}
              onSegmentationComplete={(result) => {
                setAiSegmentation(result);
                console.log('AI Segmentation complete:', result);
              }}
              onSegmentationUpdate={(result) => {
                setAiSegmentation(result);
                console.log('AI Segmentation updated:', result);
              }}
            />
          ) : (
            <>
              <div ref={viewportRef} style={{ width: 512, height: 512, border: '1px solid #000' }}>
                <AnnotationTool onAnnotation={handleAnnotation} />
              </div>

              <div style={{ marginTop: 10 }}>
                <label>Slice: </label>
                <input
                  type="range"
                  min={0}
                  max={totalSlices - 1}
                  value={currentSlice}
                  onChange={(e) => handleSliceChange(parseInt(e.target.value))}
                  style={{ width: 300 }}
                />
                <span> {currentSlice + 1} / {totalSlices}</span>
                <p>Loading Progress: {Math.round(loadingProgress * 100)}%</p>
              </div>

              <div style={{ marginTop: 10 }}>
                <h4>Window Level</h4>
                <div>
                  <label>Window Width: </label>
                  <input
                    type="number"
                    value={windowWidth}
                    onChange={(e) => handleWindowLevelChange(parseInt(e.target.value), windowCenter)}
                  />
                </div>
                <div>
                  <label>Window Center: </label>
                  <input
                    type="number"
                    value={windowCenter}
                    onChange={(e) => handleWindowLevelChange(windowWidth, parseInt(e.target.value))}
                  />
                </div>
                <div>
                  <button onClick={() => handleWindowLevelChange(80, 40)}>Brain</button>
                  <button onClick={() => handleWindowLevelChange(2000, 500)}>Bone</button>
                  <button onClick={() => handleWindowLevelChange(1500, -600)}>Lung</button>
                  <button onClick={() => handleWindowLevelChange(400, 50)}>Soft Tissue</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <CommentPanel comments={comments} onAddComment={handleAddComment} />
    </div>
  );
}
