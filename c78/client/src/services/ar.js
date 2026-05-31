const TRACKING_STATE = {
  DETECTING: 'detecting',
  TRACKING: 'tracking',
  LOST: 'lost'
}

export class ARController {
  constructor(canvas, videoElement) {
    this.canvas = canvas
    this.videoElement = videoElement
    this.ctx = canvas.getContext('2d')
    this.currentTool = 'arrow'
    this.currentColor = '#ff4444'
    this.isDrawing = false
    this.startX = 0
    this.startY = 0
    this.currentX = 0
    this.currentY = 0
    this.onAnnotation = null
    
    this.myAnnotations = []
    this.externalAnnotations = []
    
    this.markerDetected = false
    this.markerPosition = { x: 0, y: 0 }
    this.markerRotation = 0
    
    this.trackingState = TRACKING_STATE.DETECTING
    this.opticalFlowFeatures = []
    this.prevFrameGray = null
    this.frameWidth = 320
    this.frameHeight = 240
    
    this.kalmanFilter = this.createKalmanFilter()
    this.lostCounter = 0
    this.maxLostFrames = 30
    this.searchRadius = 100
    
    this.tempCanvas = document.createElement('canvas')
    this.tempCtx = this.tempCanvas.getContext('2d')
    this.tempCanvas.width = this.frameWidth
    this.tempCanvas.height = this.frameHeight
    
    this.animationId = null
    this.setupEventListeners()
    this.setupMarkerDetection()
  }

  setCurrentColor(color) {
    this.currentColor = color
  }

  addExternalAnnotation(annotation) {
    this.externalAnnotations.push(annotation)
  }

  clearAnnotations() {
    this.myAnnotations = []
  }

  clearInstructorAnnotations(instructorId) {
    this.externalAnnotations = this.externalAnnotations.filter(
      a => a.instructorId !== instructorId
    )
  }

  createKalmanFilter() {
    return {
      x: 0, y: 0,
      vx: 0, vy: 0,
      P: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
      Q: 0.001,
      R: 0.1,
      
      predict(dt = 1) {
        const F = [
          [1, 0, dt, 0],
          [0, 1, 0, dt],
          [0, 0, 1, 0],
          [0, 0, 0, 1]
        ]
        
        this.x = F[0][0] * this.x + F[0][2] * this.vx
        this.y = F[1][1] * this.y + F[1][3] * this.vy
        
        const newP = [[], [], [], []]
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            newP[i][j] = 0
            for (let k = 0; k < 4; k++) {
              newP[i][j] += F[i][k] * this.P[k][j]
            }
          }
        }
        
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            this.P[i][j] = newP[i][j] + (i === j ? this.Q : 0)
          }
        }
      },
      
      update(measX, measY) {
        const H = [[1, 0, 0, 0], [0, 1, 0, 0]]
        
        const y1 = measX - (H[0][0] * this.x + H[0][1] * this.y)
        const y2 = measY - (H[1][0] * this.x + H[1][1] * this.y)
        
        const S11 = H[0][0] * this.P[0][0] * H[0][0] + H[0][1] * this.P[1][0] * H[0][0] + this.R
        const S12 = H[0][0] * this.P[0][1] * H[1][1] + H[0][1] * this.P[1][1] * H[1][1]
        const S21 = H[1][0] * this.P[0][0] * H[0][0] + H[1][1] * this.P[1][0] * H[0][0]
        const S22 = H[1][0] * this.P[0][1] * H[1][1] + H[1][1] * this.P[1][1] * H[1][1] + this.R
        
        const det = S11 * S22 - S12 * S21
        const invS = [
          [S22 / det, -S12 / det],
          [-S21 / det, S11 / det]
        ]
        
        const K = [[0, 0], [0, 0], [0, 0], [0, 0]]
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 2; j++) {
            for (let k = 0; k < 2; k++) {
              K[i][j] += this.P[i][k] * H[k][j] * invS[j][j]
            }
          }
        }
        
        this.x += K[0][0] * y1 + K[0][1] * y2
        this.y += K[1][0] * y1 + K[1][1] * y2
        this.vx += K[2][0] * y1 + K[2][1] * y2
        this.vy += K[3][0] * y1 + K[3][1] * y2
        
        const I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
        const KH = [[], [], [], []]
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            KH[i][j] = 0
            for (let k = 0; k < 4; k++) {
              KH[i][j] += K[i][k] * H[k][j] * I[k][j]
            }
          }
        }
        
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            this.P[i][j] = (I[i][j] - KH[i][j]) * this.P[i][j]
          }
        }
      },
      
      reset(x, y) {
        this.x = x
        this.y = y
        this.vx = 0
        this.vy = 0
        this.P = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
      }
    }
  }

  setCurrentTool(tool) {
    this.currentTool = tool
  }

  setupEventListeners() {
    const handleStart = (e) => {
      this.isDrawing = true
      const rect = this.canvas.getBoundingClientRect()
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      
      this.startX = (clientX - rect.left) * (this.canvas.width / rect.width)
      this.startY = (clientY - rect.top) * (this.canvas.height / rect.height)
      this.currentX = this.startX
      this.currentY = this.startY
    }

    const handleMove = (e) => {
      if (!this.isDrawing) return
      
      const rect = this.canvas.getBoundingClientRect()
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      
      this.currentX = (clientX - rect.left) * (this.canvas.width / rect.width)
      this.currentY = (clientY - rect.top) * (this.canvas.height / rect.height)
    }

    const handleEnd = () => {
      if (!this.isDrawing) return
      this.isDrawing = false
      
      const dx = this.currentX - this.startX
      const dy = this.currentY - this.startY
      const angle = Math.atan2(dy, dx)
      
      const usePos = this.trackingState !== TRACKING_STATE.DETECTING
      const posX = usePos ? this.smoothedPosition.x : (this.startX + this.currentX) / 2
      const posY = usePos ? this.smoothedPosition.y : (this.startY + this.currentY) / 2
      
      const annotation = {
        type: this.currentTool,
        x: posX,
        y: posY,
        angle: angle,
        radius: Math.sqrt(dx * dx + dy * dy) / 2,
        color: this.currentColor,
        timestamp: Date.now()
      }
      
      this.myAnnotations.push(annotation)
      
      if (this.onAnnotation) {
        this.onAnnotation(annotation)
      }
    }

    this.canvas.addEventListener('mousedown', handleStart)
    this.canvas.addEventListener('mousemove', handleMove)
    this.canvas.addEventListener('mouseup', handleEnd)
    this.canvas.addEventListener('mouseleave', handleEnd)
    
    this.canvas.addEventListener('touchstart', handleStart, { passive: false })
    this.canvas.addEventListener('touchmove', handleMove, { passive: false })
    this.canvas.addEventListener('touchend', handleEnd)
  }

  toGrayscale(imageData) {
    const gray = new Uint8Array(imageData.width * imageData.height)
    for (let i = 0; i < imageData.data.length; i += 4) {
      gray[i / 4] = Math.round(
        0.299 * imageData.data[i] +
        0.587 * imageData.data[i + 1] +
        0.114 * imageData.data[i + 2]
      )
    }
    return gray
  }

  applyThreshold(grayscale, threshold) {
    const result = new Uint8Array(grayscale.length)
    for (let i = 0; i < grayscale.length; i++) {
      result[i] = grayscale[i] < threshold ? 0 : 255
    }
    return result
  }

  findContours(binary, width, height) {
    const contours = []
    const visited = new Set()
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        if (binary[idx] === 0 && !visited.has(idx)) {
          const contour = this.traceContour(binary, x, y, width, height, visited)
          if (contour.length > 10) {
            contours.push(contour)
          }
        }
      }
    }
    
    return contours
  }

  traceContour(binary, startX, startY, width, height, visited) {
    const contour = []
    let x = startX
    let y = startY
    let dx = 1
    let dy = 0
    
    let iterations = 0
    while (iterations < 1000) {
      const idx = y * width + x
      if (visited.has(idx)) break
      
      visited.add(idx)
      contour.push({ x, y })
      
      const nextX = x + dx
      const nextY = y + dy
      
      if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height) {
        const nextIdx = nextY * width + nextX
        if (binary[nextIdx] === 0) {
          x = nextX
          y = nextY
        } else {
          const temp = dx
          dx = -dy
          dy = temp
        }
      } else {
        const temp = dx
        dx = -dy
        dy = temp
      }
      
      iterations++
    }
    
    return contour
  }

  findQuadrilaterals(contours) {
    const quads = []
    
    for (const contour of contours) {
      const simplified = this.simplifyContour(contour, 5)
      
      if (simplified.length >= 4 && simplified.length <= 10) {
        const quad = this.fitQuadrilateral(simplified)
        if (quad) {
          quads.push(quad)
        }
      }
    }
    
    return quads
  }

  simplifyContour(contour, epsilon) {
    if (contour.length <= 2) return contour
    
    const result = [contour[0]]
    let last = contour[0]
    
    for (let i = 1; i < contour.length; i++) {
      const dist = Math.sqrt(
        Math.pow(contour[i].x - last.x, 2) +
        Math.pow(contour[i].y - last.y, 2)
      )
      
      if (dist > epsilon) {
        result.push(contour[i])
        last = contour[i]
      }
    }
    
    return result
  }

  fitQuadrilateral(contour) {
    if (contour.length < 4) return null
    
    const sorted = [...contour].sort((a, b) => a.x - b.x)
    
    const left = sorted.slice(0, 2)
    const right = sorted.slice(-2)
    
    left.sort((a, b) => a.y - b.y)
    right.sort((a, b) => a.y - b.y)
    
    return [left[0], right[0], right[1], left[1]]
  }

  extractFeatures(grayImg, centerX, centerY, radius, width) {
    const features = []
    const step = 8
    
    for (let dy = -radius; dy <= radius; dy += step) {
      for (let dx = -radius; dx <= radius; dx += step) {
        const x = Math.floor(centerX + dx)
        const y = Math.floor(centerY + dy)
        
        if (x >= 2 && x < width - 2 && y >= 2 && y < this.frameHeight - 2) {
          const idx = y * width + x
          const val = grayImg[idx]
          
          const gx = grayImg[idx + 1] - grayImg[idx - 1]
          const gy = grayImg[idx + width] - grayImg[idx - width]
          const grad = gx * gx + gy * gy
          
          if (grad > 100) {
            features.push({ x, y, val })
          }
        }
      }
    }
    
    return features.slice(0, 50)
  }

  calculateOpticalFlow(prevGray, currGray, features, width) {
    const trackedFeatures = []
    const windowSize = 15
    const halfWindow = Math.floor(windowSize / 2)
    
    for (const feature of features) {
      let bestDx = 0
      let bestDy = 0
      let minError = Infinity
      
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const newX = feature.x + dx
          const newY = feature.y + dy
          
          if (newX < halfWindow || newX >= width - halfWindow ||
              newY < halfWindow || newY >= this.frameHeight - halfWindow) {
            continue
          }
          
          let error = 0
          let count = 0
          
          for (let wy = -halfWindow; wy <= halfWindow; wy++) {
            for (let wx = -halfWindow; wx <= halfWindow; wx++) {
              const prevIdx = (feature.y + wy) * width + (feature.x + wx)
              const currIdx = (newY + wy) * width + (newX + wx)
              
              if (prevIdx >= 0 && prevIdx < prevGray.length &&
                  currIdx >= 0 && currIdx < currGray.length) {
                error += Math.abs(prevGray[prevIdx] - currGray[currIdx])
                count++
              }
            }
          }
          
          if (count > 0 && error / count < minError) {
            minError = error / count
            bestDx = dx
            bestDy = dy
          }
        }
      }
      
      if (minError < 30) {
        trackedFeatures.push({
          x: feature.x + bestDx,
          y: feature.y + bestDy,
          dx: bestDx,
          dy: bestDy,
          error: minError
        })
      }
    }
    
    return trackedFeatures
  }

  estimateMotion(trackedFeatures) {
    if (trackedFeatures.length < 5) return null
    
    let sumDx = 0
    let sumDy = 0
    
    for (const f of trackedFeatures) {
      sumDx += f.dx
      sumDy += f.dy
    }
    
    return {
      dx: sumDx / trackedFeatures.length,
      dy: sumDy / trackedFeatures.length,
      confidence: trackedFeatures.length
    }
  }

  detectMarkers() {
    if (!this.videoElement || !this.videoElement.videoWidth) return false
    
    this.tempCtx.drawImage(this.videoElement, 0, 0, this.frameWidth, this.frameHeight)
    const imageData = this.tempCtx.getImageData(0, 0, this.frameWidth, this.frameHeight)
    const currGray = this.toGrayscale(imageData)
    
    let detected = false
    let markerCenterX = 0
    let markerCenterY = 0
    
    const threshold = this.applyThreshold(currGray, 100)
    const contours = this.findContours(threshold, this.frameWidth, this.frameHeight)
    const quadrilaterals = this.findQuadrilaterals(contours)
    
    if (quadrilaterals.length > 0) {
      const marker = quadrilaterals[0]
      markerCenterX = marker.reduce((sum, p) => sum + p.x, 0) / marker.length
      markerCenterY = marker.reduce((sum, p) => sum + p.y, 0) / marker.length
      
      const edge = {
        x: marker[1].x - marker[0].x,
        y: marker[1].y - marker[0].y
      }
      this.markerRotation = Math.atan2(edge.y, edge.x)
      
      detected = true
    }
    
    if (this.trackingState === TRACKING_STATE.DETECTING) {
      if (detected) {
        this.trackingState = TRACKING_STATE.TRACKING
        this.opticalFlowFeatures = this.extractFeatures(
          currGray, markerCenterX, markerCenterY, 40, this.frameWidth
        )
        this.kalmanFilter.reset(markerCenterX, markerCenterY)
        this.lostCounter = 0
      }
    } else if (this.trackingState === TRACKING_STATE.TRACKING) {
      if (detected) {
        this.kalmanFilter.predict()
        this.kalmanFilter.update(markerCenterX, markerCenterY)
        this.opticalFlowFeatures = this.extractFeatures(
          currGray, markerCenterX, markerCenterY, 40, this.frameWidth
        )
        this.lostCounter = 0
      } else {
        if (this.prevFrameGray && this.opticalFlowFeatures.length > 0) {
          const tracked = this.calculateOpticalFlow(
            this.prevFrameGray, currGray, this.opticalFlowFeatures, this.frameWidth
          )
          const motion = this.estimateMotion(tracked)
          
          if (motion && motion.confidence > 5) {
            this.kalmanFilter.predict()
            const predictedX = this.kalmanFilter.x + motion.dx
            const predictedY = this.kalmanFilter.y + motion.dy
            
            this.kalmanFilter.update(predictedX, predictedY)
            
            this.opticalFlowFeatures = tracked.map(f => ({ x: f.x, y: f.y, val: 0 }))
            this.lostCounter++
            
            if (this.lostCounter > this.maxLostFrames) {
              this.trackingState = TRACKING_STATE.LOST
            }
          } else {
            this.lostCounter++
            if (this.lostCounter > this.maxLostFrames) {
              this.trackingState = TRACKING_STATE.LOST
            }
          }
        } else {
          this.lostCounter++
          if (this.lostCounter > this.maxLostFrames) {
            this.trackingState = TRACKING_STATE.LOST
          }
        }
      }
    } else if (this.trackingState === TRACKING_STATE.LOST) {
      if (detected) {
        const dist = Math.sqrt(
          Math.pow(markerCenterX - this.kalmanFilter.x, 2) +
          Math.pow(markerCenterY - this.kalmanFilter.y, 2)
        )
        
        if (dist < this.searchRadius) {
          this.trackingState = TRACKING_STATE.TRACKING
          this.kalmanFilter.reset(markerCenterX, markerCenterY)
          this.opticalFlowFeatures = this.extractFeatures(
            currGray, markerCenterX, markerCenterY, 40, this.frameWidth
          )
          this.lostCounter = 0
        }
      } else {
        if (this.lostCounter > 120) {
          this.trackingState = TRACKING_STATE.DETECTING
          this.lostCounter = 0
        } else {
          this.kalmanFilter.predict()
          this.lostCounter++
        }
      }
    }
    
    this.prevFrameGray = currGray
    
    const scaleX = this.canvas.width / this.frameWidth
    const scaleY = this.canvas.height / this.frameHeight
    
    if (this.trackingState !== TRACKING_STATE.DETECTING) {
      this.smoothedPosition = {
        x: this.kalmanFilter.x * scaleX,
        y: this.kalmanFilter.y * scaleY
      }
    }
    
    this.markerDetected = this.trackingState === TRACKING_STATE.TRACKING
    
    return this.markerDetected
  }

  getStateColor() {
    switch (this.trackingState) {
      case TRACKING_STATE.TRACKING:
        return '#00ff00'
      case TRACKING_STATE.LOST:
        return '#ffaa00'
      default:
        return '#888888'
    }
  }

  getStateText() {
    switch (this.trackingState) {
      case TRACKING_STATE.TRACKING:
        return '跟踪中'
      case TRACKING_STATE.LOST:
        return '丢失 - 搜索中'
      default:
        return '检测中'
    }
  }

  drawAnnotation(ctx, annotation) {
    const color = annotation.instructorColor || annotation.color
    ctx.save()
    
    if (annotation.type === 'arrow') {
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = 4
      
      ctx.translate(annotation.x, annotation.y)
      ctx.rotate(annotation.angle || 0)
      
      const size = 60
      ctx.beginPath()
      ctx.moveTo(-size / 2, 0)
      ctx.lineTo(size / 2, 0)
      ctx.lineTo(size / 2 - 15, -12)
      ctx.moveTo(size / 2, 0)
      ctx.lineTo(size / 2 - 15, 12)
      ctx.stroke()
    } else if (annotation.type === 'circle') {
      ctx.strokeStyle = color
      ctx.lineWidth = 4
      
      ctx.beginPath()
      ctx.arc(annotation.x, annotation.y, annotation.radius || 40, 0, Math.PI * 2)
      ctx.stroke()
      
      ctx.beginPath()
      ctx.arc(annotation.x, annotation.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    } else if (annotation.type === 'point') {
      ctx.fillStyle = color
      
      ctx.beginPath()
      ctx.arc(annotation.x, annotation.y, 12, 0, Math.PI * 2)
      ctx.fill()
      
      ctx.beginPath()
      ctx.arc(annotation.x, annotation.y, 6, 0, Math.PI * 2)
      ctx.fillStyle = '#000'
      ctx.fill()
    }
    
    ctx.restore()
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    
    if (this.trackingState !== TRACKING_STATE.DETECTING) {
      const pos = this.smoothedPosition
      
      this.ctx.save()
      this.ctx.strokeStyle = this.getStateColor()
      this.ctx.lineWidth = 3
      this.ctx.beginPath()
      this.ctx.arc(pos.x, pos.y, 50, 0, Math.PI * 2)
      this.ctx.stroke()
      
      if (this.trackingState === TRACKING_STATE.LOST) {
        this.ctx.setLineDash([5, 5])
        this.ctx.beginPath()
        this.ctx.arc(pos.x, pos.y, this.searchRadius * (this.canvas.width / this.frameWidth), 0, Math.PI * 2)
        this.ctx.stroke()
      }
      this.ctx.restore()
    }
    
    for (const annotation of this.myAnnotations) {
      this.drawAnnotation(this.ctx, annotation)
    }
    
    for (const annotation of this.externalAnnotations) {
      this.drawAnnotation(this.ctx, annotation)
    }
    
    if (this.isDrawing) {
      this.ctx.save()
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
      this.ctx.lineWidth = 2
      this.ctx.setLineDash([5, 5])
      
      if (this.currentTool === 'arrow') {
        const dx = this.currentX - this.startX
        const dy = this.currentY - this.startY
        const angle = Math.atan2(dy, dx)
        
        this.ctx.beginPath()
        this.ctx.moveTo(this.startX, this.startY)
        this.ctx.lineTo(this.currentX, this.currentY)
        this.ctx.stroke()
        
        const arrowSize = 15
        this.ctx.beginPath()
        this.ctx.moveTo(this.currentX, this.currentY)
        this.ctx.lineTo(
          this.currentX - arrowSize * Math.cos(angle - Math.PI / 6),
          this.currentY - arrowSize * Math.sin(angle - Math.PI / 6)
        )
        this.ctx.moveTo(this.currentX, this.currentY)
        this.ctx.lineTo(
          this.currentX - arrowSize * Math.cos(angle + Math.PI / 6),
          this.currentY - arrowSize * Math.sin(angle + Math.PI / 6)
        )
        this.ctx.stroke()
      } else if (this.currentTool === 'circle') {
        const centerX = (this.startX + this.currentX) / 2
        const centerY = (this.startY + this.currentY) / 2
        const radius = Math.sqrt(
          Math.pow(this.currentX - this.startX, 2) +
          Math.pow(this.currentY - this.startY, 2)
        ) / 2
        
        this.ctx.beginPath()
        this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
        this.ctx.stroke()
      } else if (this.currentTool === 'point') {
        this.ctx.beginPath()
        this.ctx.arc(this.currentX, this.currentY, 10, 0, Math.PI * 2)
        this.ctx.stroke()
      }
      
      this.ctx.restore()
    }
    
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    this.ctx.fillRect(10, 10, 220, 100)
    this.ctx.fillStyle = '#ffffff'
    this.ctx.font = '14px Arial'
    this.ctx.fillText(`工具: ${this.currentTool}`, 20, 35)
    this.ctx.fillText(`状态: ${this.getStateText()}`, 20, 55)
    this.ctx.fillStyle = this.getStateColor()
    this.ctx.fillRect(20, 65, Math.min(180, 180 - (this.lostCounter * 6)), 10)
    this.ctx.fillStyle = '#ffffff'
    this.ctx.fillText('提示: 绘制或对准标记添加标注', 20, 95)
  }

  start() {
    const resize = () => {
      this.canvas.width = this.canvas.offsetWidth
      this.canvas.height = this.canvas.offsetHeight
    }
    
    resize()
    window.addEventListener('resize', resize)
    
    const animate = () => {
      this.detectMarkers()
      this.draw()
      this.animationId = requestAnimationFrame(animate)
    }
    
    animate()
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }
}
