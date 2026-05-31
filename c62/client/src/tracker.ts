import { Region } from './types';

declare global {
  interface Window {
    cv: any;
    opencvReady: boolean;
  }
}

export interface TrackPoint {
  frame: number;
  time: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isKeyFrame: boolean;
}

export interface TrackResult {
  points: TrackPoint[];
  regions: Region[];
}

export class ObjectTracker {
  private cv: any = null;
  private isReady = false;

  async init(): Promise<boolean> {
    return new Promise((resolve) => {
      const checkOpenCV = () => {
        if (window.cv && window.cv.Mat) {
          this.cv = window.cv;
          this.isReady = true;
          resolve(true);
        } else if (window.opencvReady) {
          setTimeout(() => {
            this.cv = window.cv;
            this.isReady = true;
            resolve(true);
          }, 500);
        } else {
          setTimeout(checkOpenCV, 100);
        }
      };
      checkOpenCV();
    });
  }

  ready(): boolean {
    return this.isReady;
  }

  private getVideoFrame(video: HTMLVideoElement): ImageData {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  private imageDataToMat(imageData: ImageData): any {
    const mat = new this.cv.Mat(imageData.height, imageData.width, this.cv.CV_8UC4);
    mat.data.set(imageData.data);
    return mat;
  }

  private rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: h * 180, s: s * 255, v: v * 255 };
  }

  private createHistogram(frame: any, roi: { x: number; y: number; width: number; height: number }): any {
    const roiMat = frame.roi(new this.cv.Rect(roi.x, roi.y, roi.width, roi.height));
    const hsvRoi = new this.cv.Mat();
    this.cv.cvtColor(roiMat, hsvRoi, this.cv.COLOR_RGBA2RGB);
    this.cv.cvtColor(hsvRoi, hsvRoi, this.cv.COLOR_RGB2HSV);

    const mask = new this.cv.Mat();
    const lower = new this.cv.Mat(hsvRoi.rows, hsvRoi.cols, hsvRoi.type(), [0, 30, 60, 0]);
    const upper = new this.cv.Mat(hsvRoi.rows, hsvRoi.cols, hsvRoi.type(), [180, 255, 255, 255]);
    this.cv.inRange(hsvRoi, lower, upper, mask);

    const hist = new this.cv.Mat();
    const channels = [0];
    const histSize = [50];
    const ranges = [0, 180];
    const hsvPlanes = new this.cv.MatVector();
    hsvPlanes.push_back(hsvRoi);
    
    this.cv.calcHist(hsvPlanes, channels, mask, hist, histSize, ranges, false);
    this.cv.normalize(hist, hist, 0, 255, this.cv.NORM_MINMAX, -1, new this.cv.Mat());

    roiMat.delete();
    hsvRoi.delete();
    mask.delete();
    lower.delete();
    upper.delete();
    hsvPlanes.delete();

    return hist;
  }

  private meanShift(
    probImage: any,
    window: { x: number; y: number; width: number; height: number },
    maxIter: number = 10,
    epsilon: number = 1
  ): { x: number; y: number; width: number; height: number } {
    let { x, y, width, height } = window;
    let iter = 0;

    while (iter < maxIter) {
      iter++;
      let sumX = 0, sumY = 0, sumWeight = 0;

      for (let i = Math.max(0, y); i < Math.min(probImage.rows, y + height); i++) {
        for (let j = Math.max(0, x); j < Math.min(probImage.cols, x + width); j++) {
          const weight = probImage.ucharPtr(i, j)[0];
          sumX += j * weight;
          sumY += i * weight;
          sumWeight += weight;
        }
      }

      if (sumWeight === 0) break;

      const newX = Math.round(sumX / sumWeight - width / 2);
      const newY = Math.round(sumY / sumWeight - height / 2);

      const dx = Math.abs(newX - x);
      const dy = Math.abs(newY - y);

      x = newX;
      y = newY;

      if (dx < epsilon && dy < epsilon) break;
    }

    x = Math.max(0, Math.min(probImage.cols - width, x));
    y = Math.max(0, Math.min(probImage.rows - height, y));

    return { x, y, width, height };
  }

  async trackObject(
    video: HTMLVideoElement,
    initialRect: { x: number; y: number; width: number; height: number },
    startTime: number,
    endTime: number,
    fps: number = 30,
    onProgress?: (progress: number) => void
  ): Promise<TrackResult> {
    if (!this.isReady) {
      throw new Error('OpenCV not initialized');
    }

    const points: TrackPoint[] = [];
    const duration = endTime - startTime;
    const totalFrames = Math.max(1, Math.floor(duration * fps / 5));

    const originalCurrentTime = video.currentTime;
    video.currentTime = startTime;

    await new Promise(resolve => setTimeout(resolve, 100));
    const firstFrameData = this.getVideoFrame(video);
    const firstFrame = this.imageDataToMat(firstFrameData);

    const hist = this.createHistogram(firstFrame, initialRect);
    let currentWindow = { ...initialRect };

    points.push({
      frame: 0,
      time: startTime,
      ...currentWindow,
      isKeyFrame: true
    });

    for (let i = 1; i <= totalFrames; i++) {
      const progress = i / totalFrames;
      const frameTime = startTime + (endTime - startTime) * progress;

      video.currentTime = frameTime;
      await new Promise(resolve => setTimeout(resolve, 16));

      const frameData = this.getVideoFrame(video);
      const frame = this.imageDataToMat(frameData);

      const hsvFrame = new this.cv.Mat();
      this.cv.cvtColor(frame, hsvFrame, this.cv.COLOR_RGBA2RGB);
      this.cv.cvtColor(hsvFrame, hsvFrame, this.cv.COLOR_RGB2HSV);

      const backProj = new this.cv.Mat();
      const channels = [0];
      const ranges = [0, 180];
      const hsvPlanes = new this.cv.MatVector();
      hsvPlanes.push_back(hsvFrame);

      this.cv.calcBackProject(hsvPlanes, channels, hist, backProj, ranges, 1);

      currentWindow = this.meanShift(backProj, currentWindow, 15, 1);

      points.push({
        frame: i,
        time: frameTime,
        ...currentWindow,
        isKeyFrame: i % 5 === 0
      });

      frame.delete();
      hsvFrame.delete();
      backProj.delete();
      hsvPlanes.delete();

      if (onProgress) onProgress(progress * 100);
    }

    firstFrame.delete();
    hist.delete();

    video.currentTime = originalCurrentTime;

    const regions: Region[] = points.map((point, index) => ({
      id: `tracked_${Date.now()}_${index}`,
      x: point.x,
      y: point.y,
      width: point.width,
      height: point.height,
      startTime: point.time,
      endTime: index < points.length - 1 ? points[index + 1].time : endTime
    }));

    return { points, regions };
  }

  interpolatePoints(points: TrackPoint[], targetFps: number = 30): TrackPoint[] {
    if (points.length < 2) return points;

    const interpolated: TrackPoint[] = [];
    
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      const timeDiff = end.time - start.time;
      const steps = Math.max(1, Math.floor(timeDiff * targetFps));

      interpolated.push(start);

      for (let j = 1; j < steps; j++) {
        const t = j / steps;
        interpolated.push({
          frame: Math.round(start.frame + (end.frame - start.frame) * t),
          time: start.time + timeDiff * t,
          x: Math.round(start.x + (end.x - start.x) * t),
          y: Math.round(start.y + (end.y - start.y) * t),
          width: Math.round(start.width + (end.width - start.width) * t),
          height: Math.round(start.height + (end.height - start.height) * t),
          isKeyFrame: false
        });
      }
    }

    interpolated.push(points[points.length - 1]);
    return interpolated;
  }

  dispose() {
    this.cv = null;
    this.isReady = false;
  }
}

export const tracker = new ObjectTracker();
