import * as THREE from 'three';
import { ProteinData, Residue } from '../types';
import { getCaAtom } from './pdbParser';
import { scoreToColor } from './colorMapping';

interface RendererOptions {
  container: HTMLElement;
  width: number;
  height: number;
}

interface RenderedInstance {
  mesh: THREE.InstancedMesh;
  dummy: THREE.Object3D;
  colorAttribute: THREE.InstancedBufferAttribute;
}

export class ProteinRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private proteinGroup: THREE.Group;
  private isWebGPUSupported: boolean;
  private controls: {
    isDragging: boolean;
    previousMouse: { x: number; y: number };
    rotation: { x: number; y: number };
    scale: number;
  };
  private animationId: number | null = null;
  private disposedMeshes: THREE.Object3D[] = [];

  constructor(options: RendererOptions) {
    this.container = options.container;
    this.isWebGPUSupported = this.checkWebGPUSupport();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);
    this.scene.fog = new THREE.FogExp2(0x0a0a0f, 0.002);

    this.camera = new THREE.PerspectiveCamera(60, options.width / options.height, 0.1, 10000);
    this.camera.position.set(0, 0, 100);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(options.width, options.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.setupLights();

    this.proteinGroup = new THREE.Group();
    this.scene.add(this.proteinGroup);

    this.controls = {
      isDragging: false,
      previousMouse: { x: 0, y: 0 },
      rotation: { x: 0, y: 0 },
      scale: 1.0
    };

    this.setupControls();
    this.animate();
  }

  private checkWebGPUSupport(): boolean {
    try {
      const gpu = (navigator as any).gpu;
      return gpu !== undefined && gpu !== null;
    } catch {
      return false;
    }
  }

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(50, 50, 50);
    directionalLight1.castShadow = true;
    this.scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0x4488ff, 0.3);
    directionalLight2.position.set(-50, -50, -50);
    this.scene.add(directionalLight2);

    const pointLight = new THREE.PointLight(0xff4444, 0.3, 200);
    pointLight.position.set(0, 30, 0);
    this.scene.add(pointLight);
  }

  private setupControls(): void {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', (e) => {
      this.controls.isDragging = true;
      this.controls.previousMouse = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!this.controls.isDragging) return;

      const deltaX = e.clientX - this.controls.previousMouse.x;
      const deltaY = e.clientY - this.controls.previousMouse.y;

      this.controls.rotation.y += deltaX * 0.01;
      this.controls.rotation.x += deltaY * 0.01;

      this.controls.previousMouse = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mouseup', () => {
      this.controls.isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
      this.controls.isDragging = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.controls.scale = Math.max(0.1, Math.min(5, this.controls.scale * delta));
    }, { passive: false });

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.controls.isDragging = true;
        this.controls.previousMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    });

    canvas.addEventListener('touchmove', (e) => {
      if (!this.controls.isDragging || e.touches.length !== 1) return;

      const deltaX = e.touches[0].clientX - this.controls.previousMouse.x;
      const deltaY = e.touches[0].clientY - this.controls.previousMouse.y;

      this.controls.rotation.y += deltaX * 0.01;
      this.controls.rotation.x += deltaY * 0.01;

      this.controls.previousMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    });

    canvas.addEventListener('touchend', () => {
      this.controls.isDragging = false;
    });
  }

  public renderProtein(
    protein: ProteinData,
    stabilityScores?: number[],
    showAtoms: boolean = true,
    showBackbone: boolean = true
  ): void {
    this.clearProtein();

    const allResidues = protein.chains.flatMap(chain => chain.residues);
    if (allResidues.length === 0) return;

    const center = this.calculateCenter(allResidues);

    const residuesWithScores: { residue: Residue; score: number; index: number }[] = [];
    for (let i = 0; i < allResidues.length; i++) {
      residuesWithScores.push({
        residue: allResidues[i],
        score: (stabilityScores && stabilityScores[i]) ?? 0.5,
        index: i
      });
    }

    if (showBackbone) {
      this.createBackbone(residuesWithScores, center);
    }

    if (showAtoms) {
      this.createAtoms(residuesWithScores, center);
    }

    this.fitCameraToProtein(allResidues, center);
  }

  private createInstancedMesh(
    geometry: THREE.BufferGeometry,
    count: number
  ): RenderedInstance {
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.25,
      roughness: 0.55
    });

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    
    const colorArray = new Float32Array(count * 3);
    const colorAttribute = new THREE.InstancedBufferAttribute(colorArray, 3);
    instancedMesh.geometry.setAttribute('instanceColor', colorAttribute);
    
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    this.proteinGroup.add(instancedMesh);

    return {
      mesh: instancedMesh,
      dummy: new THREE.Object3D(),
      colorAttribute
    };
  }

  private updateInstance(
    instance: RenderedInstance,
    index: number,
    position: THREE.Vector3,
    scale: number,
    color: THREE.Color
  ): void {
    instance.dummy.position.copy(position);
    instance.dummy.scale.setScalar(scale);
    instance.dummy.updateMatrix();
    instance.mesh.setMatrixAt(index, instance.dummy.matrix);

    const colorArray = instance.colorAttribute.array as Float32Array;
    colorArray[index * 3] = color.r;
    colorArray[index * 3 + 1] = color.g;
    colorArray[index * 3 + 2] = color.b;
    instance.colorAttribute.needsUpdate = true;
  }

  private finalizeInstancedMesh(instance: RenderedInstance): void {
    instance.mesh.instanceMatrix.needsUpdate = true;
    instance.colorAttribute.needsUpdate = true;
    instance.mesh.geometry.attributes.instanceColor = instance.colorAttribute;
    instance.mesh.geometry.attributes.instanceColor.needsUpdate = true;
  }

  private createBackbone(
    residuesWithScores: { residue: Residue; score: number; index: number }[],
    center: THREE.Vector3
  ): void {
    const caPositions: THREE.Vector3[] = [];
    const caScores: number[] = [];

    for (let i = 0; i < residuesWithScores.length; i++) {
      const { residue, score } = residuesWithScores[i];
      const ca = getCaAtom(residue);
      if (ca) {
        caPositions.push(new THREE.Vector3(
          ca.x - center.x,
          ca.y - center.y,
          ca.z - center.z
        ));
        caScores.push(score);
      }
    }

    if (caPositions.length < 2) return;

    const bondPoints: THREE.Vector3[] = [];
    const bondColors: THREE.Color[] = [];

    for (let i = 0; i < caPositions.length - 1; i++) {
      bondPoints.push(caPositions[i]);
      bondPoints.push(caPositions[i + 1]);

      const avgScore = (caScores[i] + caScores[i + 1]) / 2;
      const [r, g, b] = scoreToColor(avgScore);
      const color = new THREE.Color(r, g, b);
      bondColors.push(color, color);
    }

    const bondGeometry = new THREE.BufferGeometry().setFromPoints(bondPoints);
    const bondColorArray = new Float32Array(bondColors.length * 3);
    bondColors.forEach((c, i) => {
      bondColorArray[i * 3] = c.r;
      bondColorArray[i * 3 + 1] = c.g;
      bondColorArray[i * 3 + 2] = c.b;
    });
    bondGeometry.setAttribute('color', new THREE.BufferAttribute(bondColorArray, 3));

    const bondMaterial = new THREE.LineBasicMaterial({
      linewidth: 2,
      vertexColors: true
    });

    const line = new THREE.LineSegments(bondGeometry, bondMaterial);
    this.proteinGroup.add(line);

    this.createCARepresentation(caPositions, caScores);
  }

  private createCARepresentation(
    positions: THREE.Vector3[],
    scores: number[]
  ): void {
    if (positions.length === 0) return;

    const sphereGeometry = new THREE.SphereGeometry(1.2, 16, 16);
    const instanced = this.createInstancedMesh(sphereGeometry, positions.length);

    for (let i = 0; i < positions.length; i++) {
      const [r, g, b] = scoreToColor(scores[i]);
      const color = new THREE.Color(r, g, b);
      this.updateInstance(instanced, i, positions[i], 1.0, color);
    }

    this.finalizeInstancedMesh(instanced);
  }

  private createAtoms(
    residuesWithScores: { residue: Residue; score: number; index: number }[],
    center: THREE.Vector3
  ): void {
    const elementColors: Record<string, number> = {
      C: 0x909090,
      N: 0x4444ff,
      O: 0xff4444,
      S: 0xffff00,
      P: 0xff8800,
      H: 0xcccccc
    };

    const elementRadii: Record<string, number> = {
      C: 0.7,
      N: 0.6,
      O: 0.6,
      S: 1.0,
      P: 1.0,
      H: 0.3
    };

    const atomsByElement: Map<string, { position: THREE.Vector3; score: number; radius: number }[]> = new Map();

    for (const { residue, score } of residuesWithScores) {
      const [rSc, gSc, bSc] = scoreToColor(score);
      const scoreColor = new THREE.Color(rSc, gSc, bSc);

      for (const atom of residue.atoms) {
        const element = atom.element.toUpperCase();
        const radius = elementRadii[element] || 0.5;

        if (!atomsByElement.has(element)) {
          atomsByElement.set(element, []);
        }

        const baseColor = new THREE.Color(elementColors[element] || 0xcccccc);
        const mixFactor = 0.6;
        
        const finalR = baseColor.r * (1 - mixFactor) + scoreColor.r * mixFactor;
        const finalG = baseColor.g * (1 - mixFactor) + scoreColor.g * mixFactor;
        const finalB = baseColor.b * (1 - mixFactor) + scoreColor.b * mixFactor;

        atomsByElement.get(element)!.push({
          position: new THREE.Vector3(
            atom.x - center.x,
            atom.y - center.y,
            atom.z - center.z
          ),
          score: (finalR + finalG + finalB) / 3,
          radius
        });
      }
    }

    for (const [element, atoms] of atomsByElement.entries()) {
      if (atoms.length === 0) continue;

      const radius = atoms[0].radius;
      const geometry = new THREE.SphereGeometry(radius, 8, 8);
      const instanced = this.createInstancedMesh(geometry, atoms.length);

      for (let i = 0; i < atoms.length; i++) {
        const { position } = atoms[i];
        const baseColor = new THREE.Color(elementColors[element] || 0xcccccc);
        
        const residueIndex = Math.floor(i / Math.max(1, atoms.length / residuesWithScores.length));
        const safeIndex = Math.min(residueIndex, residuesWithScores.length - 1);
        const [rSc, gSc, bSc] = scoreToColor(residuesWithScores[safeIndex].score);
        const scoreColor = new THREE.Color(rSc, gSc, bSc);
        
        const mixFactor = 0.6;
        const finalColor = new THREE.Color(
          baseColor.r * (1 - mixFactor) + scoreColor.r * mixFactor,
          baseColor.g * (1 - mixFactor) + scoreColor.g * mixFactor,
          baseColor.b * (1 - mixFactor) + scoreColor.b * mixFactor
        );

        this.updateInstance(instanced, i, position, 1.0, finalColor);
      }

      this.finalizeInstancedMesh(instanced);
    }
  }

  private clearProtein(): void {
    while (this.proteinGroup.children.length > 0) {
      const child = this.proteinGroup.children[0];
      this.proteinGroup.remove(child);
      
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (obj.geometry) {
            Object.values(obj.geometry.attributes).forEach(attr => {
              if (attr && typeof (attr as any).dispose === 'function') {
                (attr as any).dispose();
              }
            });
            obj.geometry.dispose();
          }
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else if (obj.material) {
            obj.material.dispose();
          }
        }
      });
      
      this.disposedMeshes.push(child);
    }
  }

  private calculateCenter(residues: Residue[]): THREE.Vector3 {
    let sumX = 0, sumY = 0, sumZ = 0;
    let count = 0;

    for (const residue of residues) {
      for (const atom of residue.atoms) {
        sumX += atom.x;
        sumY += atom.y;
        sumZ += atom.z;
        count++;
      }
    }

    return new THREE.Vector3(
      sumX / Math.max(count, 1),
      sumY / Math.max(count, 1),
      sumZ / Math.max(count, 1)
    );
  }

  private fitCameraToProtein(residues: Residue[], center: THREE.Vector3): void {
    let maxDist = 0;

    for (const residue of residues) {
      for (const atom of residue.atoms) {
        const dx = atom.x - center.x;
        const dy = atom.y - center.y;
        const dz = atom.z - center.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        maxDist = Math.max(maxDist, dist);
      }
    }

    const fov = this.camera.fov * (Math.PI / 180);
    const distance = (maxDist * 2.5) / Math.tan(fov / 2);

    this.camera.position.set(0, 0, Math.max(distance, 20));
    this.camera.lookAt(0, 0, 0);
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);

    this.proteinGroup.rotation.x = this.controls.rotation.x;
    this.proteinGroup.rotation.y = this.controls.rotation.y;
    this.proteinGroup.scale.setScalar(this.controls.scale);

    this.renderer.render(this.scene, this.camera);
  };

  public getWebGPUSupport(): boolean {
    return this.isWebGPUSupported;
  }

  public dispose(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }

    this.clearProtein();

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry) {
          Object.values(obj.geometry.attributes).forEach(attr => {
            if (attr && typeof (attr as any).dispose === 'function') {
              (attr as any).dispose();
            }
          });
          obj.geometry.dispose();
        }
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else if (obj.material) {
          obj.material.dispose();
        }
      }
    });

    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
    this.disposedMeshes = [];
  }
}
