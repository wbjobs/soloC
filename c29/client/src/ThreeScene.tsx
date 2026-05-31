import { useRef, useMemo, useEffect, useState, Suspense, memo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera, Environment, Box, Sphere, Cylinder, Dodecahedron, Html, useProgress, Center, LOD } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { usePartData, useAlarms, useModelState, useModelConfig, useStore, useAnimationState, useReplayState } from './store';
import { DEVICE_PARTS, THRESHOLDS, DevicePart, DeviceData, Alarm, PART_ANIMATION_CONFIGS, PartAnimationConfig } from './types';

const loadGLTF = (url: string, enableDraco: boolean, onProgress: (progress: number) => void): Promise<THREE.Group> => {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    
    if (enableDraco) {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      dracoLoader.setDecoderConfig({ type: 'js' });
      loader.setDRACOLoader(dracoLoader);
    }

    loader.load(
      url,
      (gltf) => {
        onProgress(100);
        const scene = gltf.scene.clone();
        
        scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.computeVertexNormals();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(m => {
                  if (m instanceof THREE.MeshStandardMaterial) {
                    m.needsUpdate = true;
                  }
                });
              } else if (child.material instanceof THREE.MeshStandardMaterial) {
                child.material.needsUpdate = true;
              }
            }
          }
        });
        
        if (enableDraco) {
          loader.setDRACOLoader(null);
        }
        
        resolve(scene);
      },
      (xhr) => {
        if (xhr.total > 0) {
          onProgress((xhr.loaded / xhr.total) * 100);
        }
      },
      (error) => {
        if (enableDraco) {
          loader.setDRACOLoader(null);
        }
        reject(error);
      }
    );
  });
};

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div style={{ 
        background: 'rgba(15, 23, 42, 0.95)',
        padding: '20px 40px',
        borderRadius: '12px',
        border: '1px solid #475569',
        textAlign: 'center',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ color: '#60a5fa', fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
          模型加载中...
        </div>
        <div style={{ 
          width: '200px', 
          height: '8px', 
          background: '#334155',
          borderRadius: '4px',
          overflow: 'hidden',
          marginBottom: '8px'
        }}>
          <div style={{ 
            height: '100%', 
            width: `${progress}%`, 
            background: 'linear-gradient(90deg, #60a5fa, #a78bfa)',
            transition: 'width 0.3s ease',
            borderRadius: '4px'
          }} />
        </div>
        <div style={{ color: '#94a3b8', fontSize: '12px', fontFamily: 'monospace' }}>
          {progress.toFixed(0)}%
        </div>
      </div>
    </Html>
  );
}

interface OptimizedLabelProps {
  position: [number, number, number];
  partName: string;
  value: string;
  color: string;
  hasCriticalAlarm: boolean;
  hasWarningAlarm: boolean;
}

const OptimizedLabel = memo(function OptimizedLabel({ 
  position, 
  partName, 
  value, 
  color,
  hasCriticalAlarm,
  hasWarningAlarm
}: OptimizedLabelProps) {
  const divRef = useRef<HTMLDivElement>(null);
  
  useFrame(() => {
    if (divRef.current && (hasCriticalAlarm || hasWarningAlarm)) {
      const pulse = 1 + Math.sin(performance.now() / 100) * 0.08;
      divRef.current.style.transform = `scale(${pulse})`;
    }
  });

  const bgColor = hasCriticalAlarm 
    ? 'rgba(239, 68, 68, 0.9)' 
    : hasWarningAlarm 
      ? 'rgba(245, 158, 11, 0.9)'
      : 'rgba(30, 41, 59, 0.9)';

  const shadow = hasCriticalAlarm || hasWarningAlarm
    ? `0 0 20px ${color}`
    : 'none';

  return (
    <Html position={position} center distanceFactor={12} zIndexRange={[100, 0]}>
      <div
        ref={divRef}
        style={{
          background: bgColor,
          padding: '6px 12px',
          borderRadius: '6px',
          border: `1px solid ${color}`,
          color: 'white',
          fontSize: '11px',
          fontWeight: '600',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: shadow,
          transformOrigin: 'center'
        }}
      >
        <div style={{ fontSize: '10px', opacity: 0.8, marginBottom: '2px' }}>
          {partName.toUpperCase()}
        </div>
        <div style={{ fontFamily: 'monospace' }}>
          {value}
        </div>
      </div>
    </Html>
  );
});

function getStatus(value: number, threshold: typeof THRESHOLDS['temperature']): 'normal' | 'warning' | 'critical' {
  if (value > threshold.max || value < threshold.min) return 'critical';
  if (value > threshold.warning) return 'warning';
  return 'normal';
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface AnimatedDevicePartProps {
  part: DevicePart;
  data: DeviceData | null;
  partAlarms: Alarm[];
  animationState: string;
  partAnimationConfig: PartAnimationConfig;
}

const AnimatedDevicePart = memo(function AnimatedDevicePart({ 
  part, 
  data, 
  partAlarms,
  animationState,
  partAnimationConfig
}: AnimatedDevicePartProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  
  const animationProgressRef = useRef(0);
  const animationDelayRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const targetStateRef = useRef<'assembled' | 'disassembled'>('assembled');
  const currentProgressRef = useRef(0);
  
  const initialPosition = useMemo(() => new THREE.Vector3(...part.position), [part.position]);
  const targetPosition = useMemo(() => new THREE.Vector3(...partAnimationConfig.disassembleTarget), [partAnimationConfig.disassembleTarget]);
  const initialRotation = useMemo(() => new THREE.Euler(0, 0, 0), []);
  const targetRotation = useMemo(() => 
    partAnimationConfig.disassembleRotation 
      ? new THREE.Euler(...partAnimationConfig.disassembleRotation)
      : new THREE.Euler(0, 0, 0), 
    [partAnimationConfig.disassembleRotation]
  );
  
  const value = data ? data[part.dataType] : 0;
  const threshold = THRESHOLDS[part.dataType];
  
  const hasCriticalAlarm = partAlarms.some(a => a.level === 'critical');
  const hasWarningAlarm = partAlarms.some(a => a.level === 'warning');
  
  const status = data && data.isRunning ? getStatus(value, threshold) : 'normal';
  
  let currentColor = part.color;
  if (status === 'critical') currentColor = part.criticalColor;
  else if (status === 'warning') currentColor = part.warningColor;

  const valueDisplay = useMemo(() => {
    if (!data) return '--';
    switch (part.dataType) {
      case 'temperature': return `${value.toFixed(1)}°C`;
      case 'pressure': return `${value.toFixed(2)} MPa`;
      case 'speed': return `${value} RPM`;
      default: return `${value}`;
    }
  }, [data, value, part.dataType]);

  useEffect(() => {
    if (animationState === 'disassembling') {
      targetStateRef.current = 'disassembled';
      animationDelayRef.current = 0;
      isAnimatingRef.current = true;
    } else if (animationState === 'assembling') {
      targetStateRef.current = 'assembled';
      animationDelayRef.current = 0;
      isAnimatingRef.current = true;
    }
  }, [animationState]);

  useFrame((state, delta) => {
    if (meshRef.current && data?.isRunning && !isAnimatingRef.current) {
      if (part.name === 'engine') {
        meshRef.current.rotation.y += delta * 1.5;
      } else if (part.name === 'motor') {
        meshRef.current.rotation.x += delta * 2;
      } else if (part.name === 'pump') {
        const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.05;
        meshRef.current.scale.set(scale, scale, scale);
      }
    }

    if (materialRef.current) {
      const targetEmissive = hasCriticalAlarm ? currentColor : '#000000';
      const currentEmissive = materialRef.current.emissive;
      currentEmissive.lerp(new THREE.Color(targetEmissive), delta * 5);
      
      const targetIntensity = hasCriticalAlarm ? 0.5 : 0;
      materialRef.current.emissiveIntensity += (targetIntensity - materialRef.current.emissiveIntensity) * delta * 5;
    }

    if (groupRef.current && isAnimatingRef.current) {
      const delay = partAnimationConfig.delay;
      
      if (animationDelayRef.current < delay) {
        animationDelayRef.current += delta;
      } else {
        const duration = partAnimationConfig.duration;
        animationProgressRef.current += delta / duration;
        
        let progress = Math.min(animationProgressRef.current, 1);
        
        if (targetStateRef.current === 'assembling') {
          progress = 1 - easeInOutCubic(progress);
        } else {
          progress = easeInOutCubic(progress);
        }

        currentProgressRef.current = progress;

        const currentPos = new THREE.Vector3();
        currentPos.lerpVectors(initialPosition, targetPosition, progress);
        groupRef.current.position.copy(currentPos);

        const currentRot = new THREE.Euler();
        currentRot.lerpVectors(initialRotation, targetRotation, progress);
        groupRef.current.rotation.copy(currentRot);

        if (animationProgressRef.current >= 1) {
          isAnimatingRef.current = false;
          animationProgressRef.current = 0;
        }
      }
    }
  });

  const renderGeometry = () => {
    switch (part.name) {
      case 'engine':
        return <Cylinder args={[0.6, 0.8, 1.5, 16]} ref={meshRef}>
          <meshStandardMaterial 
            ref={materialRef}
            color={currentColor}
            metalness={0.3}
            roughness={0.4}
          />
        </Cylinder>;
      case 'motor':
        return <Box args={[0.8, 0.6, 1.2]} ref={meshRef}>
          <meshStandardMaterial 
            ref={materialRef}
            color={currentColor}
            metalness={0.3}
            roughness={0.4}
          />
        </Box>;
      case 'pump':
        return <Dodecahedron args={[0.5]} ref={meshRef}>
          <meshStandardMaterial 
            ref={materialRef}
            color={currentColor}
            metalness={0.3}
            roughness={0.4}
          />
        </Dodecahedron>;
      default:
        return <Sphere args={[0.5]} ref={meshRef}>
          <meshStandardMaterial 
            ref={materialRef}
            color={currentColor}
            metalness={0.3}
            roughness={0.4}
          />
        </Sphere>;
    }
  };

  const labelOffsetY = animationState === 'disassembled' || isAnimatingRef.current ? 0.8 : 1.2;

  return (
    <group ref={groupRef} position={part.position}>
      {renderGeometry()}

      <mesh position={[0, -0.8, 0]}>
        <Box args={[1.2, 0.2, 1.2]}>
          <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.5} />
        </Box>
      </mesh>

      <OptimizedLabel
        position={[0, labelOffsetY, 0]}
        partName={part.name}
        value={valueDisplay}
        color={currentColor}
        hasCriticalAlarm={hasCriticalAlarm}
        hasWarningAlarm={hasWarningAlarm}
      />
    </group>
  );
});

function ReplayController() {
  const replayState = useReplayState();
  const setReplayIndex = useStore((state) => state.setReplayIndex);
  const setReplayData = useStore((state) => state.setReplayData);
  const setAnimationState = useStore((state) => state.setAnimationState);
  const stopReplay = useStore((state) => state.stopReplay);
  const animationState = useAnimationState();

  const lastTickRef = useRef<number>(0);
  const isAutoPlayingRef = useRef(true);

  useEffect(() => {
    isAutoPlayingRef.current = true;
    lastTickRef.current = 0;
  }, [replayState.isReplaying]);

  useFrame((state, delta) => {
    if (!replayState.isReplaying) return;
    if (!isAutoPlayingRef.current) return;
    if (replayState.historyData.length === 0) return;

    lastTickRef.current += delta * 1000;
    const interval = 1000 / replayState.speed;

    if (lastTickRef.current >= interval) {
      lastTickRef.current = 0;
      
      const nextIndex = replayState.currentIndex + 1;
      
      if (nextIndex >= replayState.historyData.length) {
        isAutoPlayingRef.current = false;
      } else {
        const data = replayState.historyData[nextIndex];
        setReplayIndex(nextIndex);
        setReplayData(data);
      }
    }
  });

  return null;
}

function ExternalModel() {
  const modelConfig = useModelConfig();
  const setModelState = useStore((state) => state.setModelState);
  const [model, setModel] = useState<THREE.Group | null>(null);

  useEffect(() => {
    if (!modelConfig.enabled) return;

    setModelState({ isLoading: true, progress: 0, error: null, loaded: false });
    
    loadGLTF(modelConfig.path, modelConfig.enableDraco, (progress) => {
      setModelState({ progress });
    })
      .then((loadedModel) => {
        loadedModel.scale.set(...modelConfig.scale);
        loadedModel.position.set(...modelConfig.position);
        loadedModel.rotation.set(...modelConfig.rotation);
        
        setModel(loadedModel);
        setModelState({ isLoading: false, progress: 100, loaded: true });
      })
      .catch((error) => {
        console.error('Model loading error:', error);
        setModelState({ 
          isLoading: false, 
          error: '模型加载失败: ' + (error.message || '未知错误'), 
          loaded: false 
        });
      });
  }, [modelConfig, setModelState]);

  if (!modelConfig.enabled) return null;
  if (!model) return null;

  return <primitive object={model} />;
}

function SceneContent() {
  const alarms = useAlarms();
  const modelConfig = useModelConfig();
  const animationState = useAnimationState();
  const replayState = useReplayState();
  const floorRef = useRef<THREE.Mesh>(null);
  const { scene, camera } = useThree();
  const setAnimationState = useStore((state) => state.setAnimationState);

  const animationCompleteRef = useRef(false);

  const hasCriticalAlarm = alarms.some(a => a.level === 'critical');
  const targetBgColor = hasCriticalAlarm ? '#1a0a0a' : '#0f172a';

  useEffect(() => {
    animationCompleteRef.current = false;
  }, [animationState]);

  useFrame((state, delta) => {
    const currentBg = scene.background as THREE.Color;
    if (currentBg) {
      const target = new THREE.Color(targetBgColor);
      currentBg.lerp(target, delta * 3);
    }
    
    if (floorRef.current) {
      const material = floorRef.current.material as THREE.MeshStandardMaterial;
      if (material && material.color) {
        const target = new THREE.Color(targetBgColor === '#1a0a0a' ? '#1a0a0a' : '#1e293b');
        material.color.lerp(target, delta * 3);
      }
    }

    if (animationState === 'disassembling' && !animationCompleteRef.current) {
      const maxDelay = Math.max(...PART_ANIMATION_CONFIGS.map(c => c.delay + c.duration));
      const elapsed = state.clock.elapsedTime;
      
      if (elapsed > maxDelay + 0.5) {
        animationCompleteRef.current = true;
        setAnimationState('disassembled');
      }
    } else if (animationState === 'assembling' && !animationCompleteRef.current) {
      const maxDelay = Math.max(...PART_ANIMATION_CONFIGS.map(c => c.delay + c.duration));
      const elapsed = state.clock.elapsedTime;
      
      if (elapsed > maxDelay + 0.5) {
        animationCompleteRef.current = true;
        setAnimationState('idle');
      }
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[8, 6, 10]} fov={50} />
      
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={4}
        maxDistance={40}
        maxPolarAngle={Math.PI / 2}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
      />

      <ambientLight intensity={0.4} />
      <directionalLight 
        position={[5, 10, 5]} 
        intensity={1} 
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        color={hasCriticalAlarm ? '#ff6666' : '#ffffff'}
      />
      <pointLight position={[-5, 5, -5]} intensity={0.5} color="#60a5fa" />
      <pointLight position={[5, 5, 5]} intensity={0.3} color="#a78bfa" />

      <fog attach="fog" args={[targetBgColor, 20, 50]} />

      <Grid
        position={[0, -1, 0]}
        args={[50, 50]}
        cellSize={1}
        cellThickness={0.3}
        cellColor="#334155"
        sectionSize={5}
        sectionThickness={0.5}
        sectionColor="#475569"
        fadeDistance={40}
        fadeStrength={1}
        infiniteGrid
      />

      <mesh ref={floorRef} position={[0, -0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial
          color="#1e293b"
          metalness={0.3}
          roughness={0.8}
        />
      </mesh>

      <group>
        {DEVICE_PARTS.map((part) => {
          const { data, alarms: partAlarms } = usePartData(part.name);
          const partConfig = PART_ANIMATION_CONFIGS.find(c => c.partName === part.name)!;
          return (
            <AnimatedDevicePart
              key={part.name}
              part={part}
              data={data as DeviceData | null}
              partAlarms={partAlarms}
              animationState={animationState}
              partAnimationConfig={partConfig}
            />
          );
        })}

        <mesh position={[0, 0, 0]}>
          <Box args={[3, 0.3, 2.5]}>
            <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.4} />
          </Box>
        </mesh>

        <mesh position={[0, -0.2, 0]}>
          <Cylinder args={[0.1, 0.1, 0.2, 16]}>
            <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
          </Cylinder>
        </mesh>
      </group>

      {modelConfig.enabled && (
        <Suspense fallback={<Loader />}>
          <ExternalModel />
        </Suspense>
      )}

      {replayState.isReplaying && <ReplayController />}

      <Environment preset="city" />
    </>
  );
}

export default function ThreeScene() {
  return (
    <div className="canvas-container">
      <Canvas 
        shadows 
        dpr={[1, 2]}
        gl={{ 
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          pixelRatio: Math.min(window.devicePixelRatio, 2)
        }}
      >
        <SceneContent />
      </Canvas>
    </div>
  );
}
