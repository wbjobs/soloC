import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs-extra';

export function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function generateClipDecisions(results, videoDuration, padding = 2) {
  const clips = results.map((result, idx) => {
    const startTime = Math.max(0, result.timestamp - padding);
    const endTime = Math.min(videoDuration, result.timestamp + padding);
    
    return {
      id: idx + 1,
      timestamp: result.timestamp,
      timestampFormatted: formatTime(result.timestamp),
      startTime,
      startTimeFormatted: formatTime(startTime),
      endTime,
      endTimeFormatted: formatTime(endTime),
      duration: endTime - startTime,
      similarity: result.similarity,
      rank: result.rank
    };
  });

  return {
    query: results[0]?.query || '',
    videoDuration,
    videoDurationFormatted: formatTime(videoDuration),
    totalResults: results.length,
    clips
  };
}

export async function extractClips(videoPath, decisions, outputDir) {
  fs.ensureDirSync(outputDir);
  const ext = path.extname(videoPath);
  const baseName = path.basename(videoPath, ext);
  
  const promises = decisions.clips.map(async (clip) => {
    const outputPath = path.join(outputDir, `${baseName}_clip_${clip.id}${ext}`);
    
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .setStartTime(clip.startTime)
        .setDuration(clip.duration)
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .run();
    });
  });
  
  return Promise.all(promises);
}

export default {
  formatTime,
  generateClipDecisions,
  extractClips
};
