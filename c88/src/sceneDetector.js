import sharp from 'sharp';
import fs from 'fs-extra';

export class SceneDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.3;
    this.minInterval = options.minInterval || 0.5;
    this.maxInterval = options.maxInterval || 5.0;
    this.resizeWidth = options.resizeWidth || 64;
    this.resizeHeight = options.resizeHeight || 64;
  }

  async computeFrameDifference(framePath1, framePath2) {
    const [img1, img2] = await Promise.all([
      sharp(framePath1)
        .resize(this.resizeWidth, this.resizeHeight, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer(),
      sharp(framePath2)
        .resize(this.resizeWidth, this.resizeHeight, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer()
    ]);

    let diffSum = 0;
    const pixelCount = img1.length;
    
    for (let i = 0; i < pixelCount; i++) {
      diffSum += Math.abs(img1[i] - img2[i]);
    }

    return diffSum / (pixelCount * 255);
  }

  async detectScenes(frames, baseFps = 1) {
    if (frames.length < 2) {
      return frames.map(f => ({ ...f, frameType: 'base', sceneChange: 0 }));
    }

    const result = [];
    let lastSelectedTimestamp = -this.maxInterval;
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const timeSinceLast = frame.timestamp - lastSelectedTimestamp;
      
      let frameType = 'base';
      let sceneChange = 0;
      
      if (i > 0) {
        sceneChange = await this.computeFrameDifference(
          frames[i - 1].path,
          frame.path
        );
      }

      const shouldSelect = 
        (i === 0) || 
        (sceneChange >= this.threshold && timeSinceLast >= this.minInterval) ||
        (timeSinceLast >= this.maxInterval);

      if (shouldSelect) {
        frameType = i === 0 ? 'base' : 
                   sceneChange >= this.threshold ? 'scene_change' : 'periodic';
        
        result.push({
          ...frame,
          frameType,
          sceneChange,
          selected: true
        });
        lastSelectedTimestamp = frame.timestamp;
      } else {
        result.push({
          ...frame,
          frameType: 'candidate',
          sceneChange,
          selected: false
        });
      }
    }

    return result;
  }

  getSelectedFrames(framesWithMetadata) {
    return framesWithMetadata.filter(f => f.selected);
  }

  getSceneChanges(framesWithMetadata) {
    return framesWithMetadata
      .filter(f => f.frameType === 'scene_change')
      .map(f => ({
        timestamp: f.timestamp,
        sceneChange: f.sceneChange
      }));
  }
}

export default SceneDetector;
