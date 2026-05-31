import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { XR, Controllers, VRButton } from '@react-three/xr';
import { Sky, Text, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Artifact } from './types';
import { PerformanceProvider, usePerformance } from './contexts/PerformanceContext';
import { PerformanceMonitor } from './components/PerformanceMonitor';
import { NetworkProvider, useNetwork } from './contexts/NetworkContext';
import { VoiceProvider } from './contexts/VoiceContext';
import { AdaptiveLOD } from './components/AdaptiveLOD';
import { OptimizedMesh } from './components/OptimizedMesh';
import { Avatar } from './components/Avatar';
import { RoomJoinPanel } from './components/RoomJoinPanel';

function OptimizedMuseumFloor() {
  const { qualityLevel } = usePerformance();

  const segments = qualityLevel === 'low' ? 10 : qualityLevel === 'medium' ? 25 : 50;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow={qualityLevel !== 'low'}>
      <planeGeometry args={[50, 50, segments, segments]} />
      <meshStandardMaterial color="#8B7355" flatShading={qualityLevel === 'low'} />
    </mesh>
  );
}

function OptimizedMuseumWalls() {
  const { qualityLevel } = usePerformance();

  const wallSegments = qualityLevel === 'low' ? 1 : qualityLevel === 'medium' ? 4 : 8;

  return (
    <group>
      <mesh position={[0, 5, -15]} castShadow={qualityLevel !== 'low'} receiveShadow={qualityLevel !== 'low'}>
        <boxGeometry args={[30, 10, 0.5, wallSegments, wallSegments, 1]} />
        <meshStandardMaterial color="#F5F5DC" flatShading={qualityLevel === 'low'} />
      </mesh>
      <mesh position={[-15, 5, 0]} rotation={[0, Math.PI / 2, 0]} castShadow={qualityLevel !== 'low'} receiveShadow={qualityLevel !== 'low'}>
        <boxGeometry args={[30, 10, 0.5, wallSegments, wallSegments, 1]} />
        <meshStandardMaterial color="#F5F5DC" flatShading={qualityLevel === 'low'} />
      </mesh>
      <mesh position={[15, 5, 0]} rotation={[0, Math.PI / 2, 0]} castShadow={qualityLevel !== 'low'} receiveShadow={qualityLevel !== 'low'}>
        <boxGeometry args={[30, 10, 0.5, wallSegments, wallSegments, 1]} />
        <meshStandardMaterial color="#F5F5DC" flatShading={qualityLevel === 'low'} />
      </mesh>
      <mesh position={[0, 5, 15]} castShadow={qualityLevel !== 'low'} receiveShadow={qualityLevel !== 'low'}>
        <boxGeometry args={[30, 10, 0.5, wallSegments, wallSegments, 1]} />
        <meshStandardMaterial color="#F5F5DC" flatShading={qualityLevel === 'low'} />
      </mesh>
    </group>
  );
}

function OptimizedPedestal({ position }: { position: { x: number; y: number; z: number } }) {
  const { qualityLevel } = usePerformance();
  const segments = qualityLevel === 'low' ? 2 : qualityLevel === 'medium' ? 4 : 8;

  return (
    <mesh position={[position.x, position.y - 0.5, position.z]} castShadow={qualityLevel !== 'low'} receiveShadow={qualityLevel !== 'low'}>
      <boxGeometry args={[1.5, 1, 1.5, segments, segments, segments]} />
      <meshStandardMaterial color="#2F4F4F" flatShading={qualityLevel === 'low'} />
    </mesh>
  );
}

function FirstPersonController() {
  const { camera } = useThree();
  const keys = useRef({ w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false });
  const { sendPosition, currentRoom } = useNetwork();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key in keys.current) {
        keys.current[e.key as keyof typeof keys.current] = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key in keys.current) {
        keys.current[e.key as keyof typeof keys.current] = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useFrame((_, delta) => {
    const speed = 5 * delta;
    const direction = new THREE.Vector3();

    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();

    if (keys.current.w || keys.current.ArrowUp) {
      camera.position.addScaledVector(direction, speed);
    }
    if (keys.current.s || keys.current.ArrowDown) {
      camera.position.addScaledVector(direction, -speed);
    }
    if (keys.current.a || keys.current.ArrowLeft) {
      camera.position.addScaledVector(right, -speed);
    }
    if (keys.current.d || keys.current.ArrowRight) {
      camera.position.addScaledVector(right, speed);
    }

    camera.position.y = 1.6;

    if (currentRoom) {
      sendPosition(
        { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z }
      );
    }
  });

  return <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 2} />;
}

function RemoteAvatars() {
  const { remoteUsers, currentRoom } = useNetwork();

  if (!currentRoom) return null;

  const colors = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#00BCD4'];

  return (
    <>
      {remoteUsers.map((user, index) => (
        <Avatar
          key={user.id}
          position={user.position}
          rotation={user.rotation}
          username={user.username}
          color={colors[index % colors.length]}
          isLocal={false}
        />
      ))}
    </>
  );
}

function ArtifactModel({
  artifact,
  onNearby,
}: {
  artifact: Artifact;
  onNearby: (nearby: boolean) => void;
}) {
  const meshRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const [isNearby, setIsNearby] = useState(false);
  const { qualityLevel } = usePerformance();

  useFrame(() => {
    if (meshRef.current) {
      const distance = camera.position.distanceTo(meshRef.current.position);
      const nearby = distance < 3;
      if (nearby !== isNearby) {
        setIsNearby(nearby);
        onNearby(nearby);
      }
    }
  });

  const segments = qualityLevel === 'low' ? 2 : qualityLevel === 'medium' ? 4 : 8;

  return (
    <group position={[artifact.position.x, artifact.position.y, artifact.position.z]} ref={meshRef}>
      <AdaptiveLOD position={[0, 0, 0]} scale={artifact.scale}>
        <OptimizedMesh>
          <boxGeometry args={[0.8, 1.2, 0.8, segments, segments, segments]} />
          <meshStandardMaterial color="#CD853F" />
        </OptimizedMesh>
      </AdaptiveLOD>

      {isNearby && (
        <Text position={[0, 2, 0]} fontSize={0.15} color="#FFFFFF" anchorX="center" anchorY="middle">
          {artifact.name}
        </Text>
      )}
    </group>
  );
}

function InfoPanel({ artifact, position }: { artifact: Artifact; position: { x: number; y: number; z: number } }) {
  const { qualityLevel } = usePerformance();

  if (qualityLevel === 'low') {
    return (
      <group position={[position.x, position.y + 2.5, position.z]}>
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[2.5, 1.5]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.8} />
        </mesh>
        <Text position={[0, 0.5, 0.02]} fontSize={0.15} color="#FFD700" anchorX="center" anchorY="middle">
          {artifact.name}
        </Text>
        <Text position={[0, 0.1, 0.02]} fontSize={0.1} color="#CCCCCC" anchorX="center" anchorY="middle">
          {artifact.era}
        </Text>
      </group>
    );
  }

  return (
    <group position={[position.x, position.y + 2.5, position.z]}>
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[2.5, 1.5]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.8} />
      </mesh>
      <Text position={[0, 0.5, 0.02]} fontSize={0.15} color="#FFD700" anchorX="center" anchorY="middle">
        {artifact.name}
      </Text>
      <Text position={[0, 0.2, 0.02]} fontSize={0.1} color="#CCCCCC" anchorX="center" anchorY="middle">
        {artifact.era}
      </Text>
      <Text position={[0, -0.3, 0.02]} fontSize={0.08} color="#FFFFFF" anchorX="center" anchorY="middle" maxWidth={2}>
        {artifact.description}
      </Text>
    </group>
  );
}

function OptimizedLighting() {
  const { qualityLevel, isVRMode } = usePerformance();

  const lightIntensity = isVRMode ? 0.8 : 1;
  const shadowMapSize = qualityLevel === 'low' ? 512 : qualityLevel === 'medium' ? 1024 : 2048;

  return (
    <>
      <ambientLight intensity={isVRMode ? 0.5 : 0.4} />
      <pointLight
        position={[0, 8, 0]}
        intensity={lightIntensity}
        castShadow={qualityLevel !== 'low'}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-bias={-0.0001}
      />
    </>
  );
}

function MuseumScene({ artifacts }: { artifacts: Artifact[] }) {
  const [nearbyArtifact, setNearbyArtifact] = useState<Artifact | null>(null);
  const { qualityLevel } = usePerformance();
  const { currentRoom } = useNetwork();

  return (
    <>
      <OptimizedLighting />
      {qualityLevel !== 'low' && <Sky sunPosition={[100, 10, 100]} />}

      <OptimizedMuseumFloor />
      <OptimizedMuseumWalls />

      {artifacts.map((artifact) => (
        <React.Fragment key={artifact.id}>
          <OptimizedPedestal position={artifact.position} />
          <ArtifactModel
            artifact={artifact}
            onNearby={(nearby) => {
              if (nearby) setNearbyArtifact(artifact);
              else if (nearbyArtifact?.id === artifact.id) setNearbyArtifact(null);
            }}
          />
          {nearbyArtifact?.id === artifact.id && <InfoPanel artifact={artifact} position={artifact.position} />}
        </React.Fragment>
      ))}

      <RemoteAvatars />

      <Controllers />
      <FirstPersonController />
    </>
  );
}

function AppContent({ artifacts }: { artifacts: Artifact[] }) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <VRButton />
      <Canvas
        shadows
        camera={{ position: [0, 1.6, 5], fov: 60 }}
        gl={{
          antialias: false,
          powerPreference: 'high-performance',
          xrCompatible: true,
        }}
      >
        <PerformanceProvider>
          <XR referenceSpace="local-floor">
            <MuseumScene artifacts={artifacts} />
          </XR>
          <PerformanceMonitor />
        </PerformanceProvider>
      </Canvas>
      <RoomJoinPanel />
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          color: 'white',
          backgroundColor: 'rgba(0,0,0,0.5)',
          padding: '10px 20px',
          borderRadius: 8,
        }}
      >
        <h1 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>🏛️ 虚拟博物馆</h1>
        <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>使用 WASD 或方向键移动，鼠标拖拽旋转视角</p>
        <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>靠近文物自动播放语音解说</p>
      </div>
    </div>
  );
}

function App() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/artifacts')
      .then((res) => res.json())
      .then((data) => {
        setArtifacts(data);
        setLoading(false);
      })
      .catch(() => {
        setArtifacts([
          {
            id: '1',
            name: '青铜鼎',
            era: '商代',
            description: '这是一件精美的商代青铜鼎，是古代贵族用于祭祀的重要礼器。鼎身饰有精美的饕餮纹，展现了古代工匠高超的铸造技艺。',
            modelUrl: '',
            position: { x: -3, y: 0, z: -5 },
            scale: 1.5,
            audioUrl: '',
          },
          {
            id: '2',
            name: '青花瓷瓶',
            era: '明代',
            description: '这件青花瓷瓶是明代景德镇窑的代表作品。瓶身绘有缠枝莲纹，青花发色纯正，釉面温润如玉，是中国古代瓷器艺术的巅峰之作。',
            modelUrl: '',
            position: { x: 3, y: 0, z: -5 },
            scale: 1.2,
            audioUrl: '',
          },
          {
            id: '3',
            name: '兵马俑',
            era: '秦代',
            description: '秦始皇陵兵马俑是世界八大奇迹之一。这尊兵马俑俑身高大，神态生动，展现了秦代军队的威武气势和古代雕塑艺术的高超水平。',
            modelUrl: '',
            position: { x: 0, y: 0, z: -8 },
            scale: 2,
            audioUrl: '',
          },
        ]);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontSize: '24px',
        }}
      >
        加载中...
      </div>
    );
  }

  return (
    <NetworkProvider>
      <VoiceProvider>
        <AppContent artifacts={artifacts} />
      </VoiceProvider>
    </NetworkProvider>
  );
}

export default App;
