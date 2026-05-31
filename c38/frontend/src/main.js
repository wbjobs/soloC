import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

class GeologicalViewer {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.model = null;
    this.modelBounds = null;
    this.wireframe = null;
    
    this.sectionPlanes = {
      x: null,
      y: null,
      z: null
    };
    this.sectionMeshes = {
      x: null,
      y: null,
      z: null
    };
    this.sectionEdges = {
      x: null,
      y: null,
      z: null
    };
    this.clippingPlanes = [];
    
    this.opacity = 0.5;
    this.showPlanes = { x: true, y: true, z: true };
    
    this.rockProperties = null;
    this.sectionsData = null;
    
    this.isModelLoaded = false;

    this.timeseriesInfo = null;
    this.framesCache = {};
    this.currentFrame = 0;
    this.totalFrames = 0;
    this.isPlaying = false;
    this.playSpeed = 1;
    this.lastFrameTime = 0;
    this.frameInterval = 100;

    this.init();
    this.setupEventListeners();
    this.loadModel();
    this.loadTimeseries();
  }

  init() {
    const container = document.getElementById('canvas-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(150, 150, 150);

    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    this.setupLighting();
    this.setupGrid();

    window.addEventListener('resize', () => this.onWindowResize());
    window.addEventListener('beforeunload', () => this.dispose());
    
    this.animate();
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(100, 100, 100);
    this.scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-100, -50, -100);
    this.scene.add(directionalLight2);
  }

  setupGrid() {
    const gridHelper = new THREE.GridHelper(200, 20, 0x444466, 0x333355);
    gridHelper.position.y = -5;
    this.scene.add(gridHelper);
  }

  dispose() {
    this.disposeModel();
    this.disposeSectionPlanes();
    
    if (this.controls) {
      this.controls.dispose();
    }
    
    if (this.renderer) {
      this.renderer.dispose();
    }
    
    this.scene?.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }

  disposeModel() {
    if (this.model) {
      if (this.model.geometry) {
        this.model.geometry.dispose();
      }
      if (this.model.material) {
        this.model.material.dispose();
      }
      this.scene.remove(this.model);
      this.model = null;
    }
    
    if (this.wireframe) {
      if (this.wireframe.geometry) {
        this.wireframe.geometry.dispose();
      }
      if (this.wireframe.material) {
        this.wireframe.material.dispose();
      }
      this.wireframe.removeFromParent();
      this.wireframe = null;
    }
  }

  disposeSectionPlanes() {
    ['x', 'y', 'z'].forEach(axis => {
      if (this.sectionMeshes[axis]) {
        this.sectionMeshes[axis].traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        this.scene.remove(this.sectionMeshes[axis]);
        this.sectionMeshes[axis] = null;
      }
      if (this.sectionEdges[axis]) {
        this.sectionEdges[axis].traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        this.sectionEdges[axis] = null;
      }
    });
  }

  async loadTimeseries() {
    try {
      const infoResponse = await fetch('/api/timeseries/info');
      this.timeseriesInfo = await infoResponse.json();
      this.totalFrames = this.timeseriesInfo.total_frames;

      document.getElementById('timelineSlider').max = this.totalFrames - 1;
      document.getElementById('timelineInfo').textContent = 
        `${this.timeseriesInfo.models.length} 个关键帧, 每阶段 ${this.timeseriesInfo.interpolation_steps} 个插值帧`;

      this.updateTimelineMarkers();
      this.loadFrame(0);
    } catch (error) {
      console.error('加载时间序列信息失败:', error);
    }
  }

  async loadFrame(frameIndex) {
    if (this.framesCache[frameIndex]) {
      this.renderFrame(this.framesCache[frameIndex]);
      return;
    }

    try {
      const response = await fetch(`/api/timeseries/frame/${frameIndex}`);
      const frameData = await response.json();
      
      this.framesCache[frameIndex] = frameData;
      this.renderFrame(frameData);
    } catch (error) {
      console.error(`加载帧 ${frameIndex} 失败:`, error);
    }
  }

  renderFrame(frameData) {
    this.currentFrame = frameData.frame_index;
    this.modelBounds = frameData.bounds;

    const vertices = new Float32Array(frameData.vertices.flat());
    const faces = new Uint32Array(frameData.faces.flat());

    if (this.model) {
      this.model.geometry.dispose();
      
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geometry.setIndex(new THREE.BufferAttribute(faces, 1));
      geometry.computeVertexNormals();

      this.addVertexColors(geometry);
      this.model.geometry = geometry;
    } else {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geometry.setIndex(new THREE.BufferAttribute(faces, 1));
      geometry.computeVertexNormals();

      this.addVertexColors(geometry);

      const material = new THREE.MeshPhongMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        shininess: 25,
        clippingPlanes: this.clippingPlanes,
        clipShadows: true
      });

      this.model = new THREE.Mesh(geometry, material);
      this.scene.add(this.model);
    }

    if (this.sectionPlanes.x) {
      this.updateSectionPlanePositions();
    } else {
      this.createSectionPlanes();
    }

    this.updateTimelineUI(frameData);
    this.updatePropertiesDisplay(50);
    this.isModelLoaded = true;
  }

  addVertexColors(geometry) {
    const positions = geometry.attributes.position.array;
    const colors = new Float32Array(positions.length);
    
    const layerColors = [
      [0.6, 0.4, 0.2],
      [0.5, 0.3, 0.15],
      [0.4, 0.35, 0.25],
      [0.3, 0.25, 0.2],
      [0.2, 0.15, 0.1]
    ];

    for (let i = 0; i < positions.length / 3; i++) {
      const z = positions[i * 3 + 2];
      const layerIndex = Math.min(Math.floor(z / 20), 4);
      const color = layerColors[Math.max(0, layerIndex)];
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  updateTimelineMarkers() {
    const markersContainer = document.getElementById('timelineMarkers');
    markersContainer.innerHTML = '';

    if (!this.timeseriesInfo) return;

    const stepsBetween = this.timeseriesInfo.interpolation_steps + 1;
    
    for (let i = 0; i < this.timeseriesInfo.models.length; i++) {
      const frameIndex = i * stepsBetween;
      const percentage = (frameIndex / (this.totalFrames - 1)) * 100;
      
      const marker = document.createElement('div');
      marker.className = 'timeline-marker keyframe';
      marker.style.left = `${percentage}%`;
      marker.title = this.timeseriesInfo.models[i].label;
      markersContainer.appendChild(marker);
    }
  }

  updateTimelineUI(frameData) {
    const slider = document.getElementById('timelineSlider');
    const progress = (frameData.frame_index / (this.totalFrames - 1)) * 100;
    slider.style.setProperty('--progress', `${progress}%`);
    slider.value = frameData.frame_index;

    document.getElementById('frameLabel').textContent = 
      `帧: ${frameData.frame_index + 1} / ${this.totalFrames}`;
    document.getElementById('phaseLabel').textContent = 
      `${frameData.label}${frameData.is_keyframe ? ' ⭐' : ''}`;
  }

  updateSectionPlanePositions() {
    if (!this.modelBounds) return;

    const bounds = this.modelBounds;
    const size = {
      x: bounds[1][0] - bounds[0][0],
      y: bounds[1][1] - bounds[0][1],
      z: bounds[1][2] - bounds[0][2]
    };

    const percentageX = parseFloat(document.getElementById('planeX').value);
    const percentageY = parseFloat(document.getElementById('planeY').value);
    const percentageZ = parseFloat(document.getElementById('planeZ').value);

    ['x', 'y', 'z'].forEach(axis => {
      const percentage = axis === 'x' ? percentageX : axis === 'y' ? percentageY : percentageZ;
      const sizeAxis = axis === 'x' ? size.x : axis === 'y' ? size.y : size.z;
      const pos = bounds[0][axis === 'x' ? 0 : axis === 'y' ? 1 : 2] + sizeAxis * percentage / 100;
      
      this.sectionPlanes[axis].constant = -pos;
      this.sectionMeshes[axis].position[axis] = pos;
    });
  }

  togglePlay() {
    this.isPlaying = !this.isPlaying;
    const btn = document.getElementById('playPause');
    
    if (this.isPlaying) {
      btn.textContent = '⏸';
      btn.classList.add('playing');
      this.lastFrameTime = performance.now();
      this.animatePlayback();
    } else {
      btn.textContent = '▶';
      btn.classList.remove('playing');
    }
  }

  animatePlayback() {
    if (!this.isPlaying) return;

    const now = performance.now();
    const elapsed = now - this.lastFrameTime;
    const adjustedInterval = this.frameInterval / this.playSpeed;

    if (elapsed >= adjustedInterval) {
      this.nextFrame();
      this.lastFrameTime = now;
    }

    requestAnimationFrame(() => this.animatePlayback());
  }

  nextFrame() {
    let next = this.currentFrame + 1;
    if (next >= this.totalFrames) {
      next = 0;
    }
    this.loadFrame(next);
  }

  prevFrame() {
    let prev = this.currentFrame - 1;
    if (prev < 0) {
      prev = this.totalFrames - 1;
    }
    this.loadFrame(prev);
  }

  async uploadModels(files) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    document.getElementById('uploadStatus').textContent = '上传中...';

    try {
      const response = await fetch('/api/timeseries/upload', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();

      if (result.status === 'success') {
        document.getElementById('uploadStatus').textContent = 
          `成功上传 ${result.uploaded_count} 个模型`;
        this.framesCache = {};
        this.loadTimeseries();
      } else {
        document.getElementById('uploadStatus').textContent = result.error || '上传失败';
      }
    } catch (error) {
      console.error('上传失败:', error);
      document.getElementById('uploadStatus').textContent = '上传失败';
    }
  }

  async resetModels() {
    try {
      await fetch('/api/timeseries/reset', { method: 'POST' });
      this.framesCache = {};
      this.loadTimeseries();
      document.getElementById('uploadStatus').textContent = '已重置为示例模型';
    } catch (error) {
      console.error('重置失败:', error);
    }
  }

  async loadModel() {
    document.getElementById('loading').style.display = 'none';
  }

  createSectionPlanes() {
    const bounds = this.modelBounds || [[0, 0, 0], [100, 100, 100]];
    const size = {
      x: bounds[1][0] - bounds[0][0],
      y: bounds[1][1] - bounds[0][1],
      z: bounds[1][2] - bounds[0][2]
    };

    const initialX = bounds[0][0] + size.x * 0.5;
    const initialY = bounds[0][1] + size.y * 0.5;
    const initialZ = bounds[0][2] + size.z * 0.5;

    this.sectionPlanes.x = new THREE.Plane(new THREE.Vector3(-1, 0, 0), -initialX);
    this.sectionPlanes.y = new THREE.Plane(new THREE.Vector3(0, -1, 0), -initialY);
    this.sectionPlanes.z = new THREE.Plane(new THREE.Vector3(0, 0, -1), -initialZ);

    this.clippingPlanes = [this.sectionPlanes.x, this.sectionPlanes.y, this.sectionPlanes.z];

    const planeColors = { x: 0xff6b6b, y: 0x4ecdc4, z: 0xffe66d };

    ['x', 'y', 'z'].forEach(axis => {
      const planeSize = {
        width: axis === 'x' ? size.y : size.x,
        height: axis === 'z' ? size.y : size.z
      };
      
      const planeGeometry = new THREE.PlaneGeometry(planeSize.width, planeSize.height, 1, 1);
      
      const planeMaterial = new THREE.MeshBasicMaterial({
        color: planeColors[axis],
        transparent: true,
        opacity: this.opacity,
        side: THREE.DoubleSide,
        depthWrite: false
      });

      const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);

      if (axis === 'x') {
        planeMesh.rotation.y = Math.PI / 2;
        planeMesh.position.set(initialX, initialY, initialZ);
      } else if (axis === 'y') {
        planeMesh.rotation.x = Math.PI / 2;
        planeMesh.position.set(initialX, initialY, initialZ);
      } else {
        planeMesh.position.set(initialX, initialY, initialZ);
      }

      this.sectionMeshes[axis] = planeMesh;
      this.scene.add(planeMesh);

      const edges = new THREE.EdgesGeometry(planeGeometry);
      const edgeMaterial = new THREE.LineBasicMaterial({ 
        color: planeColors[axis], 
        linewidth: 2,
        transparent: true,
        opacity: 0.9
      });
      const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
      this.sectionEdges[axis] = edgeLines;
      planeMesh.add(edgeLines);
    });

    if (this.model) {
      this.model.material.clippingPlanes = this.clippingPlanes;
    }
  }

  updateSectionPlane(axis, percentage) {
    const bounds = this.modelBounds || [[0, 0, 0], [100, 100, 100]];
    const size = {
      x: bounds[1][0] - bounds[0][0],
      y: bounds[1][1] - bounds[0][1],
      z: bounds[1][2] - bounds[0][2]
    };

    const pos = bounds[0][axis === 'x' ? 0 : axis === 'y' ? 1 : 2] + 
                size[axis === 'x' ? 'x' : axis === 'y' ? 'y' : 'z'] * percentage / 100;

    const centerY = (bounds[0][1] + bounds[1][1]) / 2;
    const centerX = (bounds[0][0] + bounds[1][0]) / 2;
    const centerZ = (bounds[0][2] + bounds[1][2]) / 2;

    if (axis === 'x') {
      this.sectionPlanes.x.constant = -pos;
      this.sectionMeshes.x.position.x = pos;
    } else if (axis === 'y') {
      this.sectionPlanes.y.constant = -pos;
      this.sectionMeshes.y.position.y = pos;
      const normalizedY = ((pos - bounds[0][1]) / size.y) * 100;
      this.updatePropertiesDisplay(normalizedY);
    } else {
      this.sectionPlanes.z.constant = -pos;
      this.sectionMeshes.z.position.z = pos;
    }
  }

  updateOpacity(opacity) {
    this.opacity = opacity / 100;
    ['x', 'y', 'z'].forEach(axis => {
      if (this.sectionMeshes[axis]) {
        this.sectionMeshes[axis].material.opacity = this.opacity;
      }
    });
  }

  togglePlane(axis, show) {
    this.showPlanes[axis] = show;
    if (this.sectionMeshes[axis]) {
      this.sectionMeshes[axis].visible = show;
    }

    const planeIndex = ['x', 'y', 'z'].indexOf(axis);
    if (show) {
      if (!this.clippingPlanes.includes(this.sectionPlanes[axis])) {
        this.clippingPlanes.splice(planeIndex, 0, this.sectionPlanes[axis]);
      }
    } else {
      const idx = this.clippingPlanes.indexOf(this.sectionPlanes[axis]);
      if (idx > -1) {
        this.clippingPlanes.splice(idx, 1);
      }
    }

    if (this.model) {
      this.model.material.clippingPlanes = this.clippingPlanes;
    }
  }

  updatePropertiesDisplay(normalizedY) {
    const content = document.getElementById('propertiesContent');
    
    if (!this.rockProperties || !this.rockProperties.layers) {
      content.innerHTML = '<div class="property-item"><span class="property-label">无数据</span></div>';
      return;
    }

    const clampedY = Math.max(0, Math.min(100, normalizedY));

    let currentLayer = null;
    for (const layer of this.rockProperties.layers) {
      if (layer.depth_range[0] <= clampedY && clampedY <= layer.depth_range[1]) {
        currentLayer = layer;
        break;
      }
    }

    if (!currentLayer) {
      currentLayer = this.rockProperties.layers[0];
    }

    const bounds = this.modelBounds || [[0, 0, 0], [100, 100, 100]];
    const actualDepth = bounds[0][1] + (bounds[1][1] - bounds[0][1]) * clampedY / 100;

    let html = `
      <div class="property-item">
        <span class="property-label">当前岩层</span>
        <span class="property-value">${currentLayer.name}</span>
      </div>
      <div class="property-item">
        <span class="property-label">深度位置</span>
        <span class="property-value">${actualDepth.toFixed(1)} m</span>
      </div>
    `;

    for (const [key, value] of Object.entries(currentLayer.properties)) {
      html += `
        <div class="property-item">
          <span class="property-label">${key}</span>
          <span class="property-value">${value}</span>
        </div>
      `;
    }

    content.innerHTML = html;
  }

  setupEventListeners() {
    document.getElementById('planeX').addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById('planeXValue').textContent = value + '%';
      this.updateSectionPlane('x', value);
    });

    document.getElementById('planeY').addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById('planeYValue').textContent = value + '%';
      this.updateSectionPlane('y', value);
    });

    document.getElementById('planeZ').addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById('planeZValue').textContent = value + '%';
      this.updateSectionPlane('z', value);
    });

    document.getElementById('opacity').addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById('opacityValue').textContent = value + '%';
      this.updateOpacity(value);
    });

    document.getElementById('showX').addEventListener('change', (e) => {
      this.togglePlane('x', e.target.checked);
    });

    document.getElementById('showY').addEventListener('change', (e) => {
      this.togglePlane('y', e.target.checked);
    });

    document.getElementById('showZ').addEventListener('change', (e) => {
      this.togglePlane('z', e.target.checked);
    });

    document.getElementById('playPause').addEventListener('click', () => {
      this.togglePlay();
    });

    document.getElementById('nextFrame').addEventListener('click', () => {
      this.nextFrame();
    });

    document.getElementById('prevFrame').addEventListener('click', () => {
      this.prevFrame();
    });

    document.getElementById('timelineSlider').addEventListener('input', (e) => {
      const frameIndex = parseInt(e.target.value);
      this.loadFrame(frameIndex);
    });

    document.getElementById('playSpeed').addEventListener('change', (e) => {
      this.playSpeed = parseFloat(e.target.value);
    });

    document.getElementById('modelUpload').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.uploadModels(e.target.files);
      }
    });

    document.getElementById('resetModels').addEventListener('click', () => {
      this.resetModels();
    });
  }

  onWindowResize() {
    const container = document.getElementById('canvas-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new GeologicalViewer();
});
