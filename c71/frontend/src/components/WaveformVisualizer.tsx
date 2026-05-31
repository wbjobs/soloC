import React, { useEffect, useRef, useCallback } from 'react';

interface WaveformVisualizerProps {
  isRecording: boolean;
  audioData?: number[];
}

const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({ isRecording, audioData = [] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (isRecording && !isInitializedRef.current) {
      initAudio();
    } else if (!isRecording && isInitializedRef.current) {
      stopAudio();
    }
    return () => stopAudio();
  }, [isRecording]);

  const drawFrame = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    analyserRef.current.getByteTimeDomainData(dataArray);
    
    ctx.fillStyle = 'rgba(26, 26, 46, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#4ade80';
    ctx.beginPath();
    
    const sliceWidth = canvas.width / bufferLength;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i += 2) {
      const v = dataArray[i] / 128.0;
      const y = (v * canvas.height) / 2;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth * 2;
    }
    
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    
    animationRef.current = requestAnimationFrame(drawFrame);
  }, []);

  const initAudio = async () => {
    if (isInitializedRef.current) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 128;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      isInitializedRef.current = true;
      drawFrame();
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopAudio = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    isInitializedRef.current = false;
  };

  return (
    <div className="waveform-container w-full h-32">
      <canvas
        ref={canvasRef}
        width={800}
        height={128}
        className="w-full h-full"
      />
      {!isRecording && (
        <div className="flex items-center justify-center h-full text-gray-400 -mt-32">
          {audioData.length > 0 ? '已录制音符' : '点击开始录制'}
        </div>
      )}
    </div>
  );
};

export default WaveformVisualizer;
