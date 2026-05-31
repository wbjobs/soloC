import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OptimizedTextureLoader, createDensityColorMap } from '../utils/OptimizedTextureLoader.js'
import { VolumeRenderer } from './VolumeRenderer.js'
import Stats from 'stats.js'

export class GalaxyVisualizer {
  constructor(container) {
    this.container = container
    this.width = container.clientWidth
    this.height = container.clientHeight
    
    this.scene = null
    this.camera = null
    this.renderer = null
    this.controls = null
    this.stats = null
    
    this.textureLoader = null
    this.slicePlane = null
    this.currentTexture = null
    this.volumeRenderer = null
    
    this.dataInfo = {
      timesteps: 100,
      dimX: 512,
      dimY: 512,
      dimZ: 512
    }
    
    this.currentAxis = 'Z'
    this.slicePosition = 256
    this.currentTimestep = 0
    
    this.isPlaying = false
    this.playSpeed = 1
    this.lastFrameTime = 0
    
    this.preloadBuffer = []
    this.preloadWindow = 5
    
    this.renderMode = 'slice'
    
    this.performanceStats = {
      fps: 0,
      frameTime: 0,
      textureUploadTime: 0,
      dataFetchTime: 0
    }
    
    this.frameCount = 0
    this.lastFpsUpdate = 0
    
    this.init()
  }
  
  init() {
    this.createScene()
    this.createCamera()
    this.createRenderer()
    this.createControls()
    this.createStats()
    this.createSlicePlane()
    this.createTextureLoader()
    this.createVolumeRenderer()
    
    this.setupEventListeners()
    this.animate()
    
    this.generateMockData()
  }
  
  createScene() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x000011)
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    this.scene.add(ambientLight)
    
    const pointLight = new THREE.PointLight(0xffffff, 1)
    pointLight.position.set(5, 5, 5)
    this.scene.add(pointLight)
  }
  
  createCamera() {
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.width / this.height,
      0.1,
      1000
    )
    this.camera.position.z = 3
  }
  
  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    })
    
    this.renderer.setSize(this.width, this.height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    
    this.container.appendChild(this.renderer.domElement)
  }
  
  createControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 1
    this.controls.maxDistance = 10
  }
  
  createStats() {
    this.stats = new Stats()
    this.stats.showPanel(0)
    this.stats.dom.style.position = 'relative'
    this.stats.dom.style.top = '0'
    this.stats.dom.style.left = '0'
    this.container.appendChild(this.stats.dom)
  }
  
  createSlicePlane() {
    const geometry = new THREE.PlaneGeometry(2, 2)
    
    this.sliceMaterial = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    })
    
    this.slicePlane = new THREE.Mesh(geometry, this.sliceMaterial)
    this.scene.add(this.slicePlane)
  }
  
  createVolumeRenderer() {
    this.volumeRenderer = new VolumeRenderer(this.scene, this.camera)
    this.volumeRenderer.setVisible(false)
  }
  
  createTextureLoader() {
    this.textureLoader = new OptimizedTextureLoader(this.renderer)
    
    const { dimX, dimY, dimZ } = this.dataInfo
    const maxDim = Math.max(dimX, dimY, dimZ)
    
    this.textureLoader.preInitializeTexture(maxDim, maxDim)
  }
  
  setupEventListeners() {
    window.addEventListener('resize', this.handleResize.bind(this))
  }
  
  handleResize() {
    this.width = this.container.clientWidth
    this.height = this.container.clientHeight
    
    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()
    
    this.renderer.setSize(this.width, this.height)
  }
  
  generateMockData() {
    if (this.renderMode === 'slice') {
      const data = this.generateSliceData(0, this.currentAxis, this.slicePosition)
      this.updateTexture(data)
    }
  }
  
  generateSliceData(timestep, axis, position) {
    const { dimX, dimY, dimZ } = this.dataInfo
    let width, height
    
    switch (axis) {
      case 'X':
        width = dimY
        height = dimZ
        break
      case 'Y':
        width = dimX
        height = dimZ
        break
      case 'Z':
        width = dimX
        height = dimY
        break
    }
    
    const data = new Float32Array(width * height)
    const centerX = width / 2
    const centerY = height / 2
    const time = timestep / this.dataInfo.timesteps
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - centerX
        const dy = y - centerY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const maxDist = Math.min(width, height) / 2
        
        let density = Math.exp(-dist * dist / (maxDist * maxDist * 0.3))
        
        const spiralAngle = Math.atan2(dy, dx) + dist * 0.1 + time * Math.PI * 2
        const spiralMod = (Math.sin(spiralAngle * 2) + 1) / 2
        density *= 0.5 + spiralMod * 0.5
        
        const noise = this.perlinNoise(x * 0.05 + time, y * 0.05 + time * 0.5)
        density += noise * 0.2
        
        data[y * width + x] = Math.max(0, Math.min(1, density))
      }
    }
    
    return { data, width, height }
  }
  
  perlinNoise(x, y) {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    const xf = x - Math.floor(x)
    const yf = y - Math.floor(y)
    
    const u = this.fade(xf)
    const v = this.fade(yf)
    
    const aa = this.p[X] + Y
    const ab = this.p[X] + Y + 1
    const ba = this.p[X + 1] + Y
    const bb = this.p[X + 1] + Y + 1
    
    const x1 = this.lerp(this.grad(this.p[aa & 255], xf, yf), this.grad(this.p[ba & 255], xf - 1, yf), u)
    const x2 = this.lerp(this.grad(this.p[ab & 255], xf, yf - 1), this.grad(this.p[bb & 255], xf - 1, yf - 1), u)
    
    return (this.lerp(x1, x2, v) + 1) / 2
  }
  
  fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10)
  }
  
  lerp(a, b, t) {
    return a + t * (b - a)
  }
  
  grad(hash, x, y) {
    const h = hash & 3
    const u = h < 2 ? x : y
    const v = h < 2 ? y : x
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
  }
  
  get p() {
    if (!this._p) {
      this._p = new Uint8Array(512)
      for (let i = 0; i < 256; i++) {
        this._p[i] = this._p[i + 256] = i
      }
      for (let i = 255; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[this._p[i], this._p[j]] = [this._p[j], this._p[i]]
      }
    }
    return this._p
  }
  
  async updateTexture({ data, width, height }) {
    const startTime = performance.now()
    
    const colorData = createDensityColorMap(data, width, height)
    
    const texture = await this.textureLoader.loadTextureAsync(colorData, width, height)
    
    if (this.currentTexture) {
      this.currentTexture.dispose()
    }
    
    this.sliceMaterial.map = texture
    this.sliceMaterial.needsUpdate = true
    this.currentTexture = texture
    
    this.performanceStats.textureUploadTime = performance.now() - startTime
  }
  
  async preloadNextFrames() {
    const preloadStart = performance.now()
    
    if (this.renderMode === 'slice') {
      for (let i = 1; i <= this.preloadWindow; i++) {
        const nextTimestep = (this.currentTimestep + i) % this.dataInfo.timesteps
        const sliceData = this.generateSliceData(nextTimestep, this.currentAxis, this.slicePosition)
        
        const colorData = createDensityColorMap(sliceData.data, sliceData.width, sliceData.height)
        this.preloadBuffer[nextTimestep] = { data: colorData, width: sliceData.width, height: sliceData.height }
      }
    }
    
    this.performanceStats.dataFetchTime = performance.now() - preloadStart
  }
  
  async updateTimestep(timestep) {
    this.currentTimestep = timestep
    
    if (this.renderMode === 'slice') {
      if (this.preloadBuffer[timestep]) {
        const preloaded = this.preloadBuffer[timestep]
        await this.updateTexture(preloaded)
        delete this.preloadBuffer[timestep]
      } else {
        const sliceData = this.generateSliceData(timestep, this.currentAxis, this.slicePosition)
        await this.updateTexture(sliceData)
      }
    } else {
      this.volumeRenderer.updateTimestep(timestep)
    }
    
    if (this.isPlaying) {
      this.preloadNextFrames()
    }
  }
  
  setRenderMode(mode) {
    this.renderMode = mode
    this.preloadBuffer = []
    
    if (mode === 'slice') {
      this.slicePlane.visible = true
      this.volumeRenderer.setVisible(false)
      this.generateMockData()
    } else {
      this.slicePlane.visible = false
      this.volumeRenderer.setVisible(true)
      if (mode === 'volume') {
        this.volumeRenderer.setRenderMode(0)
      } else if (mode === 'mip') {
        this.volumeRenderer.setRenderMode(1)
      } else if (mode === 'iso') {
        this.volumeRenderer.setRenderMode(2)
      }
    }
  }
  
  setAxis(axis) {
    this.currentAxis = axis
    this.preloadBuffer = []
    if (this.renderMode === 'slice') {
      this.generateMockData()
    }
  }
  
  setSlicePosition(position) {
    this.slicePosition = position
    this.preloadBuffer = []
    if (this.renderMode === 'slice') {
      this.generateMockData()
    }
  }
  
  togglePlay() {
    this.isPlaying = !this.isPlaying
    if (this.isPlaying) {
      this.preloadNextFrames()
    }
    return this.isPlaying
  }
  
  setPlaySpeed(speed) {
    this.playSpeed = speed
  }
  
  setVolumeIsoValue(value) {
    if (this.volumeRenderer) {
      this.volumeRenderer.setIsoValue(value)
    }
  }
  
  setVolumeStepSize(value) {
    if (this.volumeRenderer) {
      this.volumeRenderer.setStepSize(value)
    }
  }
  
  setVolumeMaxSteps(value) {
    if (this.volumeRenderer) {
      this.volumeRenderer.setMaxSteps(value)
    }
  }
  
  setVolumeOpacity(value) {
    if (this.volumeRenderer) {
      this.volumeRenderer.setOpacity(value)
    }
  }
  
  animate() {
    requestAnimationFrame(this.animate.bind(this))
    
    this.stats.begin()
    
    const currentTime = performance.now()
    const deltaTime = (currentTime - this.lastFrameTime) / 1000
    this.lastFrameTime = currentTime
    
    if (this.isPlaying) {
      this.currentTimestep += deltaTime * this.playSpeed * 10
      if (this.currentTimestep >= this.dataInfo.timesteps) {
        this.currentTimestep = 0
      }
      
      if (Math.floor(this.currentTimestep) !== Math.floor(this.currentTimestep - deltaTime * this.playSpeed * 10)) {
        this.updateTimestep(Math.floor(this.currentTimestep))
      }
    }
    
    if (this.volumeRenderer) {
      this.volumeRenderer.update()
    }
    
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    
    this.frameCount++
    if (currentTime - this.lastFpsUpdate >= 1000) {
      this.performanceStats.fps = this.frameCount
      this.performanceStats.frameTime = 1000 / this.frameCount
      this.frameCount = 0
      this.lastFpsUpdate = currentTime
    }
    
    this.stats.end()
  }
  
  getPerformanceStats() {
    return {
      ...this.performanceStats,
      uploadStats: this.textureLoader.getStats()
    }
  }
  
  dispose() {
    window.removeEventListener('resize', this.handleResize.bind(this))
    
    if (this.textureLoader) {
      this.textureLoader.dispose()
    }
    
    if (this.currentTexture) {
      this.currentTexture.dispose()
    }
    
    if (this.volumeRenderer) {
      this.volumeRenderer.dispose()
    }
    
    this.sliceMaterial.dispose()
    this.renderer.dispose()
    
    this.container.removeChild(this.renderer.domElement)
    this.container.removeChild(this.stats.dom)
  }
}
