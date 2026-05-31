import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs-extra';
import path from 'path';
import tmp from 'tmp';
import { SceneDetector } from './sceneDetector.js';

tmp.setGracefulCleanup();

export async function extractFrames(videoPath, fps = 1) {
  const tmpDir = tmp.dirSync({ prefix: 'video-frames-', unsafeCleanup: true });
  const outputPattern = path.join(tmpDir.name, 'frame-%06d.jpg');
  
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([`-vf fps=${fps}`, '-q:v 2'])
      .output(outputPattern)
      .on('end', () => {
        const frames = fs.readdirSync(tmpDir.name)
          .filter(f => f.match(/^frame-\d+\.jpg$/))
          .sort()
          .map((filename, index) => ({
            index,
            timestamp: index / fps,
            path: path.join(tmpDir.name, filename)
          }));
        resolve({ frames, tmpDir });
      })
      .on('error', (err) => {
        tmpDir.removeCallback();
        reject(err);
      })
      .run();
  });
}

export async function extractFramesAdaptive(videoPath, options = {}) {
  const {
    baseFps = 2,
    threshold = 0.3,
    minInterval = 0.5,
    maxInterval = 5.0
  } = options;

  console.log(`使用自适应抽帧: 基础帧率=${baseFps}fps, 阈值=${threshold}, 最小间隔=${minInterval}s, 最大间隔=${maxInterval}s`);
  
  const tmpDir = tmp.dirSync({ prefix: 'video-frames-', unsafeCleanup: true });
  const outputPattern = path.join(tmpDir.name, 'frame-%06d.jpg');
  
  try {
    const { frames: allFrames } = await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions([`-vf fps=${baseFps}`, '-q:v 2'])
        .output(outputPattern)
        .on('end', () => {
          const frames = fs.readdirSync(tmpDir.name)
            .filter(f => f.match(/^frame-\d+\.jpg$/))
            .sort()
            .map((filename, index) => ({
              index,
              timestamp: index / baseFps,
              path: path.join(tmpDir.name, filename)
            }));
          resolve({ frames, tmpDir });
        })
        .on('error', (err) => {
          tmpDir.removeCallback();
          reject(err);
        })
        .run();
    });

    console.log(`初始抽取了 ${allFrames.length} 帧 (${baseFps}fps)`);

    const detector = new SceneDetector({
      threshold,
      minInterval,
      maxInterval
    });

    const framesWithMetadata = await detector.detectScenes(allFrames, baseFps);
    const selectedFrames = detector.getSelectedFrames(framesWithMetadata);
    const sceneChanges = detector.getSceneChanges(framesWithMetadata);

    console.log(`场景切换检测完成: 检测到 ${sceneChanges.length} 次场景切换`);
    console.log(`已选择 ${selectedFrames.length} 帧进行特征提取`);

    return {
      allFrames,
      selectedFrames,
      framesWithMetadata,
      sceneChanges,
      tmpDir,
      baseFps
    };
  } catch (error) {
    tmpDir.removeCallback();
    throw error;
  }
}

export function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) reject(err);
      resolve(metadata.format.duration);
    });
  });
}

export function getVideoFps(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) reject(err);
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (videoStream && videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/');
        resolve(parseInt(num) / parseInt(den));
      } else {
        resolve(30);
      }
    });
  });
}

export default {
  extractFrames,
  extractFramesAdaptive,
  getVideoDuration,
  getVideoFps
};
