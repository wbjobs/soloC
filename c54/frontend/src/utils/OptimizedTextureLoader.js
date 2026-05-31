import * as THREE from 'three'

export class OptimizedTextureLoader {
  constructor(renderer) {
    this.renderer = renderer
    this.gl = renderer.getContext()
    
    this.pboExtensions = null
    this.doubleBuffer = null
    this.currentBufferIndex = 0
    this.texturePool = new Map()
    
    this.uploadQueue = []
    this.isProcessing = false
    this.maxConcurrentUploads = 2
    
    this.stats = {
      totalUploads: 0,
      avgUploadTime: 0,
      lastUploadTime: 0
    }
    
    this.initExtensions()
  }
  
  initExtensions() {
    const gl = this.gl
    
    this.pboExtensions = {
      pbo: gl.getExtension('GL_EXT_pixel_buffer_object') || 
           gl.getExtension('WEBGL_pixel_buffer_object'),
      dsa: gl.getExtension('GL_EXT_direct_state_access'),
      textureStorage: gl.getExtension('GL_EXT_texture_storage') ||
                      gl.getExtension('WEBGL_texture_storage')
    }
    
    console.log('WebGL Extensions:', {
      pboSupported: !!this.pboExtensions.pbo,
      dsaSupported: !!this.pboExtensions.dsa,
      textureStorageSupported: !!this.pboExtensions.textureStorage
    })
  }
  
  createDoubleBuffer(width, height) {
    const gl = this.gl
    
    if (!this.pboExtensions.pbo) {
      console.warn('PBO not supported, falling back to standard upload')
      return null
    }
    
    const buffers = []
    for (let i = 0; i < 2; i++) {
      const buffer = gl.createBuffer()
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, buffer)
      gl.bufferData(gl.PIXEL_UNPACK_BUFFER, width * height * 4, gl.STREAM_DRAW)
      buffers.push(buffer)
    }
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null)
    
    return {
      buffers,
      width,
      height,
      fence: null
    }
  }
  
  async loadTextureAsync(data, width, height, options = {}) {
    return new Promise((resolve, reject) => {
      this.uploadQueue.push({
        data,
        width,
        height,
        options,
        resolve,
        reject
      })
      
      this.processQueue()
    })
  }
  
  async processQueue() {
    if (this.isProcessing || this.uploadQueue.length === 0) return
    
    this.isProcessing = true
    
    while (this.uploadQueue.length > 0) {
      const items = this.uploadQueue.splice(0, this.maxConcurrentUploads)
      
      await Promise.all(items.map(item => this.uploadTexture(item)))
    }
    
    this.isProcessing = false
  }
  
  async uploadTexture({ data, width, height, options, resolve }) {
    const startTime = performance.now()
    
    try {
      let texture
      const poolKey = `${width}-${height}`
      
      if (this.texturePool.has(poolKey)) {
        texture = this.texturePool.get(poolKey)
        this.updateTextureData(texture, data, width, height)
      } else {
        texture = this.createTexture(data, width, height, options)
        this.texturePool.set(poolKey, texture)
      }
      
      const endTime = performance.now()
      const uploadTime = endTime - startTime
      
      this.stats.lastUploadTime = uploadTime
      this.stats.totalUploads++
      this.stats.avgUploadTime = 
        (this.stats.avgUploadTime * (this.stats.totalUploads - 1) + uploadTime) / 
        this.stats.totalUploads
      
      resolve(texture)
    } catch (error) {
      console.error('Texture upload failed:', error)
      resolve(this.createFallbackTexture(width, height))
    }
  }
  
  createTexture(data, width, height, options) {
    const texture = new THREE.DataTexture(
      data,
      width,
      height,
      THREE.RGBAFormat,
      THREE.FloatType,
      THREE.UVMapping,
      THREE.ClampToEdgeWrapping,
      THREE.ClampToEdgeWrapping,
      THREE.LinearFilter,
      THREE.LinearFilter
    )
    
    texture.needsUpdate = true
    texture.unpackAlignment = 1
    
    if (options.useMipmaps) {
      texture.generateMipmaps = true
      texture.minFilter = THREE.LinearMipmapLinearFilter
    }
    
    return texture
  }
  
  updateTextureData(texture, data, width, height) {
    const gl = this.gl
    
    if (this.pboExtensions.pbo && this.doubleBuffer) {
      this.uploadWithPBO(texture, data, width, height)
    } else {
      texture.image.data.set(data)
      texture.needsUpdate = true
    }
  }
  
  uploadWithPBO(texture, data, width, height) {
    const gl = this.gl
    const buffer = this.doubleBuffer.buffers[this.currentBufferIndex]
    
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, buffer)
    
    if (gl.fenceSync) {
      if (this.doubleBuffer.fence) {
        const syncStatus = gl.clientWaitSync(
          this.doubleBuffer.fence,
          gl.SYNC_FLUSH_COMMANDS_BIT,
          0
        )
        
        if (syncStatus === gl.TIMEOUT_EXPIRED) {
          gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null)
          texture.image.data.set(data)
          texture.needsUpdate = true
          return
        }
        
        gl.deleteSync(this.doubleBuffer.fence)
      }
    }
    
    gl.bufferSubData(gl.PIXEL_UNPACK_BUFFER, 0, data)
    
    texture.needsUpdate = true
    
    if (gl.fenceSync) {
      this.doubleBuffer.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    }
    
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null)
    
    this.currentBufferIndex = (this.currentBufferIndex + 1) % 2
  }
  
  uploadInChunks(texture, data, width, height, chunkSize = 256) {
    const gl = this.gl
    const textureProperties = this.renderer.properties.get(texture)
    
    if (!textureProperties || !textureProperties.__webglTexture) {
      texture.image.data.set(data)
      texture.needsUpdate = true
      return
    }
    
    const webglTexture = textureProperties.__webglTexture
    gl.bindTexture(gl.TEXTURE_2D, webglTexture)
    
    const rowsPerChunk = Math.min(chunkSize, height)
    const totalChunks = Math.ceil(height / rowsPerChunk)
    
    for (let i = 0; i < totalChunks; i++) {
      const yOffset = i * rowsPerChunk
      const rows = Math.min(rowsPerChunk, height - yOffset)
      const byteOffset = yOffset * width * 4
      const byteLength = rows * width * 4
      
      const chunkData = new Uint8Array(data.buffer, byteOffset, byteLength)
      
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        yOffset,
        width,
        rows,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        chunkData
      )
    }
    
    gl.bindTexture(gl.TEXTURE_2D, null)
  }
  
  createFallbackTexture(width, height) {
    const data = new Float32Array(width * height * 4).fill(0.5)
    return this.createTexture(data, width, height, {})
  }
  
  preInitializeTexture(width, height) {
    const key = `${width}-${height}`
    if (!this.texturePool.has(key)) {
      const data = new Float32Array(width * height * 4)
      const texture = this.createTexture(data, width, height, { useMipmaps: false })
      this.texturePool.set(key, texture)
      
      if (this.pboExtensions.pbo) {
        this.doubleBuffer = this.createDoubleBuffer(width, height)
      }
      
      return texture
    }
    return this.texturePool.get(key)
  }
  
  dispose() {
    this.texturePool.forEach(texture => {
      texture.dispose()
    })
    this.texturePool.clear()
    
    if (this.doubleBuffer) {
      const gl = this.gl
      this.doubleBuffer.buffers.forEach(buffer => {
        gl.deleteBuffer(buffer)
      })
      this.doubleBuffer = null
    }
    
    this.uploadQueue = []
  }
  
  getStats() {
    return { ...this.stats }
  }
}

export function compressDataToRGBA(data, width, height) {
  const rgbaData = new Uint8Array(width * height * 4)
  
  let min = Infinity, max = -Infinity
  for (let i = 0; i < data.length; i++) {
    min = Math.min(min, data[i])
    max = Math.max(max, data[i])
  }
  
  const range = max - min || 1
  
  for (let i = 0; i < data.length; i++) {
    const normalized = ((data[i] - min) / range) * 255
    const idx = i * 4
    
    rgbaData[idx] = normalized
    rgbaData[idx + 1] = normalized
    rgbaData[idx + 2] = normalized
    rgbaData[idx + 3] = 255
  }
  
  return rgbaData
}

export function createDensityColorMap(data, width, height) {
  const rgbaData = new Uint8Array(width * height * 4)
  
  let min = Infinity, max = -Infinity
  for (let i = 0; i < data.length; i++) {
    min = Math.min(min, data[i])
    max = Math.max(max, data[i])
  }
  
  const range = max - min || 1
  
  for (let i = 0; i < data.length; i++) {
    const normalized = (data[i] - min) / range
    const idx = i * 4
    
    const r = Math.floor(normalized * 255)
    const g = Math.floor(Math.pow(normalized, 0.5) * 255)
    const b = Math.floor(Math.pow(normalized, 0.25) * 255)
    
    rgbaData[idx] = r
    rgbaData[idx + 1] = g
    rgbaData[idx + 2] = b
    rgbaData[idx + 3] = 255
  }
  
  return rgbaData
}
