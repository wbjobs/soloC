import fs from 'fs-extra';

export function parseTimeToSeconds(timeStr) {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parseFloat(timeStr);
}

export function formatSecondsToTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 25);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

export function parseScriptLine(line) {
  line = line.trim();
  if (!line || line.startsWith('#') || line.startsWith('//')) {
    return null;
  }

  const timeRangeRegex = /(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–~]\s*(\d{1,2}:\d{2}(?::\d{2})?)/;
  const match = line.match(timeRangeRegex);
  
  if (!match) {
    return null;
  }

  const startTime = parseTimeToSeconds(match[1]);
  const endTime = parseTimeToSeconds(match[2]);
  const description = line.replace(timeRangeRegex, '').trim();

  return {
    startTime,
    endTime,
    duration: endTime - startTime,
    description,
    originalLine: line
  };
}

export function parseScript(scriptContent) {
  const lines = scriptContent.split('\n');
  const clips = [];

  for (const line of lines) {
    const clip = parseScriptLine(line);
    if (clip) {
      clips.push(clip);
    }
  }

  clips.sort((a, b) => a.startTime - b.startTime);

  return {
    totalClips: clips.length,
    totalDuration: clips.reduce((sum, c) => sum + c.duration, 0),
    clips
  };
}

export async function parseScriptFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  return parseScript(content);
}

export function classifyShotType(description) {
  const desc = description.toLowerCase();
  
  const shotTypes = {
    extreme_close_up: ['极特写', '大特写', 'extreme close up', 'ecu', 'xcu'],
    close_up: ['特写', '近景', 'close up', 'cu', 'close-up'],
    medium_close_up: ['中近景', 'medium close up', 'mcu'],
    medium_shot: ['中景', '半身', 'medium shot', 'ms'],
    medium_long_shot: ['中远景', 'medium long shot', 'mls'],
    long_shot: ['远景', '全景', 'long shot', 'ls', 'full shot'],
    extreme_long_shot: ['大远景', 'extreme long shot', 'els', 'wide shot', 'ws']
  };

  for (const [type, keywords] of Object.entries(shotTypes)) {
    if (keywords.some(k => desc.includes(k))) {
      return type;
    }
  }

  const cameraAngles = {
    high_angle: ['俯视', 'high angle', 'bird eye'],
    low_angle: ['仰视', 'low angle', 'worm eye'],
    overhead: ['顶拍', 'overhead', 'top down'],
    dutch: ['斜拍', 'dutch angle', 'tilted'],
    pov: ['第一视角', '主观镜头', 'pov', 'point of view'],
    over_the_shoulder: ['过肩', 'over the shoulder', 'ots']
  };

  for (const [angle, keywords] of Object.entries(cameraAngles)) {
    if (keywords.some(k => desc.includes(k))) {
      return angle;
    }
  }

  return 'unknown';
}

export function extractKeywords(description) {
  const words = description
    .replace(/[，。！？、；：""''（）\[\].,!?;:'"()]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);

  const stopWords = ['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '镜头', '画面'];
  
  return words.filter(w => !stopWords.includes(w) && w.length > 1);
}

export default {
  parseTimeToSeconds,
  formatSecondsToTime,
  parseScriptLine,
  parseScript,
  parseScriptFile,
  classifyShotType,
  extractKeywords
};
