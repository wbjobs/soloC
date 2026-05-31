import fs from 'fs-extra';
import path from 'path';
import { formatSecondsToTime } from './scriptParser.js';

function timeToFrames(seconds, fps = 25) {
  return Math.round(seconds * fps);
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function generatePremiereXML(timeline, videoPath, options = {}) {
  const {
    fps = 25,
    width = 1920,
    height = 1080,
    pixelAspectRatio = 'square',
    videoCodec = 'AVCHD',
    audioSampleRate = 48000,
    audioBits = 16,
    projectName = 'AutoEditProject'
  } = options;

  const videoFileName = path.basename(videoPath);
  const totalFrames = timeToFrames(timeline.totalDuration, fps);

  let clipsXML = '';
  let trackItemsXML = '';
  let currentFrame = 0;

  for (let i = 0; i < timeline.clips.length; i++) {
    const clip = timeline.clips[i];
    const clipId = `clip-${i}-${generateUUID()}`;
    const masterClipId = `master-${i}-${generateUUID()}`;
    
    const startFrame = timeToFrames(clip.sourceStartTime, fps);
    const endFrame = timeToFrames(clip.sourceEndTime, fps);
    const inFrame = currentFrame;
    const outFrame = currentFrame + (endFrame - startFrame);

    clipsXML += `
  <clip id="${masterClipId}" name="${videoFileName} (${i + 1})" frameBlend="FALSE">
    <rate>
      <timebase>${fps}</timebase>
      <ntsc>FALSE</ntsc>
    </rate>
    <in>${startFrame}</in>
    <out>${endFrame}</out>
    <duration>${endFrame - startFrame}</duration>
    <media>
      <video>
        <track>
          <clipitem id="${clipId}" frameBlend="FALSE">
            <rate>
              <timebase>${fps}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
            <name>${clip.description || `Clip ${i + 1}`}</name>
            <in>${startFrame}</in>
            <out>${endFrame}</out>
            <duration>${endFrame - startFrame}</duration>
            <start>${inFrame}</start>
            <end>${outFrame}</end>
            <enabled>TRUE</enabled>
            <duration>${endFrame - startFrame}</duration>
            <file id="file-1">
              <name>${videoFileName}</name>
              <pathurl>file://localhost/${videoPath.replace(/\\/g, '/')}</pathurl>
              <rate>
                <timebase>${fps}</timebase>
                <ntsc>FALSE</ntsc>
              </rate>
              <media>
                <video>
                  <duration>${endFrame - startFrame}</duration>
                  <samplecharacteristics>
                    <width>${width}</width>
                    <height>${height}</height>
                    <pixelaspectratio>square</pixelaspectratio>
                    <rate>
                      <timebase>${fps}</timebase>
                      <ntsc>FALSE</ntsc>
                    </rate>
                    <codec>
                      <name>${videoCodec}</name>
                    </codec>
                    <depth>24</depth>
                  </samplecharacteristics>
                </video>
                <audio>
                  <duration>${endFrame - startFrame}</duration>
                  <samplecharacteristics>
                    <samplerate>${audioSampleRate}</samplerate>
                    <depth>${audioBits}</depth>
                    <channels>2</channels>
                  </samplecharacteristics>
                </audio>
              </media>
            </file>
            <compositemode>normal</compositemode>
            <alphatype>none</alphatype>
          </clipitem>
        </track>
      </video>
    </media>
  </clip>`;

    trackItemsXML += `
          <clipitem id="track-${clipId}" frameBlend="FALSE">
            <rate>
              <timebase>${fps}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
            <name>${clip.description || `Clip ${i + 1}`}</name>
            <in>${startFrame}</in>
            <out>${endFrame}</out>
            <start>${inFrame}</start>
            <end>${outFrame}</end>
            <enabled>TRUE</enabled>
            <duration>${endFrame - startFrame}</duration>
            <file id="file-1"></file>
            <compositemode>normal</compositemode>
            <alphatype>none</alphatype>
            <pixelaspectratio>square</pixelaspectratio>
            <anamorphic>FALSE</anamorphic>
            <fielddominance>none</fielddominance>
            <colordepth>24</colordepth>
          </clipitem>`;

    currentFrame = outFrame;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <project id="project-1">
    <name>${projectName}</name>
    <children>
      <sequence id="sequence-1" uid="${generateUUID()}">
        <name>Auto-Edited Sequence</name>
        <duration>${totalFrames}</duration>
        <rate>
          <timebase>${fps}</timebase>
          <ntsc>FALSE</ntsc>
        </rate>
        <media>
          <video>
            <format>
              <samplecharacteristics>
                <width>${width}</width>
                <height>${height}</height>
                <pixelaspectratio>${pixelAspectRatio}</pixelaspectratio>
                <rate>
                  <timebase>${fps}</timebase>
                  <ntsc>FALSE</ntsc>
                </rate>
                <depth>24</depth>
              </samplecharacteristics>
            </format>
            <track>${trackItemsXML}
            </track>
          </video>
          <audio>
            <format>
              <samplecharacteristics>
                <samplerate>${audioSampleRate}</samplerate>
                <depth>${audioBits}</depth>
              </samplecharacteristics>
            </format>
            <track>
            </track>
          </audio>
        </media>
        <logginginfo>
          <description>Automatically edited sequence from script</description>
        </logginginfo>
      </sequence>
      <bin id="bin-1">
        <name>Footage</name>
        <children>${clipsXML}
        </children>
      </bin>
    </children>
  </project>
</xmeml>`;

  return xml;
}

export function generateEditDecisionList(timeline, videoPath) {
  const edl = [];
  
  edl.push('TITLE: Auto-Edited Sequence');
  edl.push(`FCM: NON-DROP FRAME`);
  edl.push('');

  for (let i = 0; i < timeline.clips.length; i++) {
    const clip = timeline.clips[i];
    const clipNum = (i + 1).toString().padStart(3, '0');
    
    edl.push(`${clipNum}  AX       V     C        ${formatSecondsToTime(clip.sourceStartTime)} ${formatSecondsToTime(clip.sourceEndTime)} ${formatSecondsToTime(clip.timelineStartTime)} ${formatSecondsToTime(clip.timelineEndTime)}`);
    edl.push(`* FROM CLIP NAME: ${path.basename(videoPath)}`);
    if (clip.description) {
      edl.push(`* COMMENT: ${clip.description}`);
    }
    edl.push('');
  }

  return edl.join('\n');
}

export async function savePremiereXML(outputPath, timeline, videoPath, options = {}) {
  const xml = generatePremiereXML(timeline, videoPath, options);
  await fs.writeFile(outputPath, xml, 'utf-8');
  return xml;
}

export async function saveEDL(outputPath, timeline, videoPath) {
  const edl = generateEditDecisionList(timeline, videoPath);
  await fs.writeFile(outputPath, edl, 'utf-8');
  return edl;
}

export default {
  generatePremiereXML,
  generateEditDecisionList,
  savePremiereXML,
  saveEDL
};
