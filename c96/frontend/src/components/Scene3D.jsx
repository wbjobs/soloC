import React, { useRef, Suspense, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, ContactShadows, LOD, Html } from '@react-three/drei';
import * as THREE from 'three';
import { calculateSunPosition } from '../utils/lightingUtils';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';

const simplifyModifier = new SimplifyModifier();

function useModelOptimization(scene) {
  useEffect(() => {
    if (!scene) return;
    
    let totalVertices = 0;
    let meshCount = 0;
    
    scene.traverse((child) => {
      if (child.isMesh) {
        meshCount++;
        if (child.geometry) {
          totalVertices += child.geometry.attributes.position?.count || 0;
        }
      }
    });
    
    console.log(`模型统计: ${meshCount} 个网格, ${totalVertices.toLocaleString()} 个顶点`);
    
    if (totalVertices > 100000) {
      console.log('模型较复杂，启动性能优化...');
    }
    
    const materials = new Map();
    
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        if (child.material) {
          const materialKey = child.material.type + '_' + child.material.color?.getHexString();
          
          if (materials.has(materialKey)) {
            child.material = materials.get(materialKey);
          } else {
            materials.set(materialKey, child.material);
          }
          
          if (child.material.envMapIntensity !== undefined) {
            child.material.envMapIntensity = 0.8;
          }
          
          if (child.material.type === 'MeshStandardMaterial') {
            child.material.roughness = Math.max(child.material.roughness || 0.5, 0.3);
          }
        }
        
        if (child.geometry && !child.geometry.boundingBox) {
          child.geometry.computeBoundingBox();
        }
        
        if (child.geometry && child.geometry.attributes.position) {
          const vertexCount = child.geometry.attributes.position.count;
          if (vertexCount > 10000) {
            try {
              const simplified = simplifyModifier.modify(child.geometry.clone(), Math.floor(vertexCount * 0.3));
              if (simplified) {
                child.geometry = simplified;
                console.log(`简化网格: ${vertexCount} -> ${simplified.attributes.position.count} 顶点`);
              }
            } catch (e) {
              console.log('几何体简化跳过:', e.message);
            }
          }
        }
        
        child.frustumCulled = true;
      }
    });
    
    scene.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.needsUpdate = true;
      }
    });
    
  }, [scene]);
}

function countVertices(scene) {
  let count = 0;
  scene.traverse((child) => {
    if (child.isMesh && child.geometry && child.geometry.attributes.position) {
      count += child.geometry.attributes.position.count;
    }
  });
  return count;
}

function createLODLevels(scene, count = 3) {
  const lod = new THREE.LOD();
  const levels = [];

  for (let i = 0; i < count; i++) {
    const levelGroup = scene.clone();

    if (i > 0) {
      const simplifyRatio = 1 - (i * 0.25);

      levelGroup.traverse((child) => {
        if (child.isMesh && child.geometry) {
          try {
            const vertexCount = child.geometry.attributes.position?.count || 0;
            if (vertexCount > 1000) {
              const simplified = simplifyModifier.modify(
                child.geometry.clone(),
                Math.floor(vertexCount * (1 - simplifyRatio))
              );
              if (simplified) {
                child.geometry = simplified;
              }
            }
          } catch (e) {
          }
        }
      });
    }

    const distance = i * 10 + 5;
    levels.push({ distance, object: levelGroup });
    lod.addLevel(levelGroup, distance);
  }

  return lod;
}

function FloorPlanModel({ url, fileType }) {
  const groupRef = useRef();
  const lodRef = useRef(null);
  const { scene } = useGLTF(url);
  const { camera } = useThree();

  useModelOptimization(scene);

  useEffect(() => {
    if (scene && groupRef.current) {
      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 5 / maxDim;

      scene.position.sub(center).multiplyScalar(scale);
      scene.position.y += 0.1;

      scene.userData.boundingBox = box;
      scene.userData.size = size.clone().multiplyScalar(scale);
      scene.userData.center = center.clone().multiplyScalar(scale).add(scene.position);

      const vertexCount = countVertices(scene);
      if (vertexCount > 50000) {
        console.log(`模型顶点数 ${vertexCount.toLocaleString()}，启用LOD系统`);
        const lod = createLODLevels(scene, 3);
        lodRef.current = lod;
        groupRef.current.add(lod);
      } else {
        groupRef.current.add(scene);
      }
    }

    return () => {
      if (groupRef.current) {
        groupRef.current.clear();
      }
    };
  }, [scene]);

  useFrame(() => {
    if (lodRef.current && camera) {
      lodRef.current.update(camera);
    }
  });

  return <group ref={groupRef} />;
}

function useShadowCameraBounds(lightRef, scene, elevation, azimuth) {
  const { camera } = useThree();
  
  useEffect(() => {
    if (!lightRef.current || !scene) return;
    
    const light = lightRef.current;
    const shadowCam = light.shadow.camera;
    
    let sceneSize = 10;
    let sceneCenter = new THREE.Vector3(0, 0, 0);
    
    if (scene.userData && scene.userData.size) {
      sceneSize = Math.max(scene.userData.size.x, scene.userData.size.z) * 1.5;
      sceneCenter = scene.userData.center || sceneCenter;
    }
    
    const padding = sceneSize * 0.3;
    const halfSize = sceneSize / 2 + padding;
    
    shadowCam.left = -halfSize;
    shadowCam.right = halfSize;
    shadowCam.top = halfSize;
    shadowCam.bottom = -halfSize;
    shadowCam.near = 1;
    shadowCam.far = sceneSize * 3;
    
    shadowCam.updateProjectionMatrix();
    light.shadow.needsUpdate = true;
    
  }, [scene, elevation, azimuth, camera]);
}

function SunLight({ config, scene }) {
  const lightRef = useRef();
  const targetRef = useRef(new THREE.Object3D());
  
  useShadowCameraBounds(lightRef, scene, config.elevation, config.azimuth);
  
  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      const pos = calculateSunPosition(config.elevation, config.azimuth);
      
      let distance = 20;
      if (scene && scene.userData && scene.userData.size) {
        distance = Math.max(scene.userData.size.x, scene.userData.size.z) * 2;
      }
      
      lightRef.current.position.set(
        pos.x * distance,
        Math.abs(pos.y) * distance,
        pos.z * distance
      );
      
      let targetPos = new THREE.Vector3(0, 0, 0);
      if (scene && scene.userData && scene.userData.center) {
        targetPos = scene.userData.center.clone();
        targetPos.y = 0;
      }
      
      targetRef.current.position.copy(targetPos);
      lightRef.current.target = targetRef.current;
      
      lightRef.current.shadow.camera.position.copy(lightRef.current.position);
      lightRef.current.shadow.camera.lookAt(targetPos);
      lightRef.current.shadow.camera.updateProjectionMatrix();
      
      lightRef.current.shadow.needsUpdate = true;
      lightRef.current.shadow.camera.updateMatrixWorld();
    }
  }, [config.elevation, config.azimuth, scene]);
  
  if (!config.enabled) return null;
  
  const shadowMapSize = config.quality === 'high' ? 2048 : config.quality === 'medium' ? 1024 : 512;
  const shadowBias = -0.001;
  const shadowRadius = config.quality === 'low' ? 1 : config.quality === 'medium' ? 2 : 3;
  
  return (
    <>
      <primitive object={targetRef.current} />
      <directionalLight
        ref={lightRef}
        intensity={config.intensity}
        color={config.color}
        castShadow
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-bias={shadowBias}
        shadow-radius={shadowRadius}
        shadow-camera-near={0.5}
        shadow-camera-far={100}
      />
    </>
  );
}

function IndoorLights({ lights, shadowEnabled }) {
  const memoizedLights = useMemo(() => {
    return lights.filter(light => light.enabled).slice(0, 8);
  }, [lights]);
  
  return (
    <>
      {memoizedLights.map((light) => {
        const commonProps = {
          intensity: light.intensity,
          color: light.color,
          castShadow: shadowEnabled,
          key: light.id
        };
        
        if (shadowEnabled) {
          commonProps.shadowMapSize = 512;
          commonProps.shadowBias = -0.001;
        }
        
        if (light.type === 'point') {
          return (
            <pointLight
              {...commonProps}
              position={[light.position.x, light.position.y, light.position.z]}
              distance={15}
              decay={2}
            />
          );
        } else if (light.type === 'spot') {
          return (
            <spotLight
              {...commonProps}
              position={[light.position.x, light.position.y, light.position.z]}
              target-position={[light.target.x, light.target.y, light.target.z]}
              angle={Math.PI / 5}
              penumbra={0.5}
              distance={20}
              decay={2}
            />
          );
        } else {
          return (
            <directionalLight
              {...commonProps}
              position={[light.position.x, light.position.y, light.position.z]}
            />
          );
        }
      })}
    </>
  );
}

function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial 
        color="#e8e8e8" 
        roughness={0.9}
        metalness={0.1}
      />
    </mesh>
  );
}

function SceneContent({ floorPlan, lightingConfig }) {
  const [sceneRef, setSceneRef] = useState(null);
  
  const shadowEnabled = lightingConfig.shadow.enabled;
  const contactShadowScale = useMemo(() => {
    if (sceneRef && sceneRef.userData && sceneRef.userData.size) {
      return Math.max(sceneRef.userData.size.x, sceneRef.userData.size.z) * 1.5;
    }
    return 20;
  }, [sceneRef]);
  
  return (
    <>
      <ambientLight
        intensity={lightingConfig.ambientLight.enabled ? lightingConfig.ambientLight.intensity : 0}
        color={lightingConfig.ambientLight.color}
      />
      
      {shadowEnabled && (
        <SunLight 
          config={{ ...lightingConfig.sunLight, quality: lightingConfig.shadow.quality }} 
          scene={sceneRef}
        />
      )}
      
      <IndoorLights 
        lights={lightingConfig.indoorLights} 
        shadowEnabled={shadowEnabled}
      />
      
      <Suspense fallback={
        <Html center>
          <div style={{ color: 'white', fontSize: '16px' }}>加载模型中...</div>
        </Html>
      }>
        {floorPlan ? (
          <group ref={(g) => {
            if (g && g.children.length > 0) {
              setSceneRef(g.children[0]);
            }
          }}>
            <FloorPlanModel url={floorPlan.fileUrl} fileType={floorPlan.fileType} />
          </group>
        ) : null}
        <Environment preset="city" />
      </Suspense>
      
      <GroundPlane />
      
      {shadowEnabled && lightingConfig.shadow.quality !== 'low' && (
        <ContactShadows
          position={[0, 0.01, 0]}
          opacity={0.4}
          scale={contactShadowScale}
          blur={lightingConfig.shadow.quality === 'high' ? 3 : 2}
          far={5}
          resolution={lightingConfig.shadow.quality === 'high' ? 1024 : 512}
        />
      )}
      
      <OrbitControls
        makeDefault
        minDistance={2}
        maxDistance={50}
        target={[0, 1, 0]}
        enableDamping
        dampingFactor={0.05}
      />
    </>
  );
}

function PerformanceMonitor() {
  const { gl } = useThree();
  const [fps, setFps] = useState(60);
  const framesRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  
  useFrame(() => {
    framesRef.current++;
    const now = performance.now();
    
    if (now - lastTimeRef.current >= 1000) {
      const currentFps = Math.round(framesRef.current * 1000 / (now - lastTimeRef.current));
      setFps(currentFps);
      framesRef.current = 0;
      lastTimeRef.current = now;
      
      if (currentFps < 20) {
        console.warn(`低帧率警告: ${currentFps} FPS - 考虑降低阴影质量`);
      }
    }
  });
  
  return null;
}

export default function Scene3D({ floorPlan, lightingConfig }) {
  const isHighPerformance = lightingConfig.shadow.quality === 'high';
  
  return (
    <Canvas
      shadows
      camera={{ position: [8, 8, 8], fov: 50 }}
      gl={{ 
        preserveDrawingBuffer: true, 
        antialias: isHighPerformance,
        powerPreference: 'high-performance',
        alpha: false,
        stencil: false,
        depth: true
      }}
      dpr={[1, Math.min(window.devicePixelRatio, 2)]}
    >
      <PerformanceMonitor />
      <color attach="background" args={['#1a1a2e']} />
      <fog attach="fog" args={['#1a1a2e', 25, 60]} />
      <SceneContent floorPlan={floorPlan} lightingConfig={lightingConfig} />
    </Canvas>
  );
}
