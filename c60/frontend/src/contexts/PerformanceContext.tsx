import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useThree } from '@react-three/fiber';

interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  triangles: number;
  drawCalls: number;
}

interface PerformanceContextType {
  metrics: PerformanceMetrics;
  isVRMode: boolean;
  qualityLevel: 'low' | 'medium' | 'high';
  setQualityLevel: (level: 'low' | 'medium' | 'high') => void;
  enableFoveatedRendering: boolean;
  setEnableFoveatedRendering: (enabled: boolean) => void;
  textureResolution: number;
  setTextureResolution: (res: number) => void;
}

const PerformanceContext = createContext<PerformanceContextType | null>(null);

export const PerformanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    frameTime: 16.67,
    triangles: 0,
    drawCalls: 0,
  });
  
  const [isVRMode, setIsVRMode] = useState(false);
  const [qualityLevel, setQualityLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [enableFoveatedRendering, setEnableFoveatedRendering] = useState(true);
  const [textureResolution, setTextureResolution] = useState(1);

  const { gl } = useThree();
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());

  useEffect(() => {
    const checkVR = () => {
      const xr = gl.xr;
      setIsVRMode(xr.isPresenting);
    };

    gl.xr.addEventListener('sessionstart', checkVR);
    gl.xr.addEventListener('sessionend', checkVR);

    return () => {
      gl.xr.removeEventListener('sessionstart', checkVR);
      gl.xr.removeEventListener('sessionend', checkVR);
    };
  }, [gl]);

  useEffect(() => {
    if (isVRMode && qualityLevel === 'high') {
      setQualityLevel('medium');
    }
  }, [isVRMode]);

  useEffect(() => {
    const interval = setInterval(() => {
      const info = gl.info;
      const memory = info.memory as { geometries?: number; textures?: number };
      
      setMetrics(prev => ({
        ...prev,
        triangles: info.render.triangles,
        drawCalls: info.render.calls,
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [gl]);

  useEffect(() => {
    let animationId: number;
    
    const updateFPS = () => {
      frameCount.current++;
      const now = performance.now();
      
      if (now - lastTime.current >= 1000) {
        const fps = Math.round((frameCount.current * 1000) / (now - lastTime.current));
        setMetrics(prev => ({
          ...prev,
          fps,
          frameTime: Math.round((1000 / fps) * 100) / 100,
        }));
        frameCount.current = 0;
        lastTime.current = now;
      }
      
      animationId = requestAnimationFrame(updateFPS);
    };
    
    animationId = requestAnimationFrame(updateFPS);
    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <PerformanceContext.Provider
      value={{
        metrics,
        isVRMode,
        qualityLevel,
        setQualityLevel,
        enableFoveatedRendering,
        setEnableFoveatedRendering,
        textureResolution,
        setTextureResolution,
      }}
    >
      {children}
    </PerformanceContext.Provider>
  );
};

export const usePerformance = () => {
  const context = useContext(PerformanceContext);
  if (!context) {
    throw new Error('usePerformance must be used within PerformanceProvider');
  }
  return context;
};
