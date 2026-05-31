import path from 'path';
import { classifyShotType, extractKeywords } from './scriptParser.js';

export class ShotMatcher {
  constructor(clipExtractor) {
    this.clip = clipExtractor;
  }

  shotTypeToPrompt(shotType) {
    const prompts = {
      extreme_close_up: 'extreme close up shot, very close to subject',
      close_up: 'close up shot, focusing on face or details',
      medium_close_up: 'medium close up shot, upper body visible',
      medium_shot: 'medium shot, person from waist up visible',
      medium_long_shot: 'medium long shot, full body visible',
      long_shot: 'long shot, wide view, environment visible',
      extreme_long_shot: 'extreme long shot, very wide view, distant',
      high_angle: 'high angle shot, looking down from above',
      low_angle: 'low angle shot, looking up from below',
      overhead: 'overhead shot, top down view',
      dutch: 'dutch angle shot, tilted camera',
      pov: 'point of view shot, first person perspective',
      over_the_shoulder: 'over the shoulder shot',
      unknown: ''
    };
    return prompts[shotType] || '';
  }

  buildQuery(clipDescription) {
    const shotType = classifyShotType(clipDescription);
    const shotPrompt = this.shotTypeToPrompt(shotType);
    const keywords = extractKeywords(clipDescription);
    
    const contentPrompt = keywords.join(' ');
    
    return {
      shotType,
      keywords,
      shotPrompt,
      contentPrompt,
      fullQuery: clipDescription + (shotPrompt ? `, ${shotPrompt}` : '')
    };
  }

  findFramesInTimeRange(framesMetadata, startTime, endTime) {
    return framesMetadata.filter(frame => {
      return frame.timestamp >= startTime && frame.timestamp <= endTime;
    });
  }

  async matchClipToFrames(clipDescription, framesInRange, numResults = 5) {
    const queryInfo = this.buildQuery(clipDescription);
    console.log(`  解析镜头: ${queryInfo.shotType}, 关键词: ${queryInfo.keywords.join(', ')}`);

    const textFeature = await this.clip.extractTextFeature(queryInfo.fullQuery);

    const scoredFrames = [];
    for (const frame of framesInRange) {
      const frameFeature = frame.feature;
      if (!frameFeature) {
        continue;
      }
      
      const similarity = this.clip.cosineSimilarity(textFeature, frameFeature);
      scoredFrames.push({
        ...frame,
        similarity,
        shotType: queryInfo.shotType,
        matchedKeywords: queryInfo.keywords
      });
    }

    scoredFrames.sort((a, b) => b.similarity - a.similarity);

    return scoredFrames.slice(0, numResults);
  }

  selectBestSegment(matchedFrames, targetDuration, minGap = 0.5) {
    if (matchedFrames.length === 0) {
      return null;
    }

    const bestFrame = matchedFrames[0];
    const halfDuration = targetDuration / 2;

    let startTime = Math.max(0, bestFrame.timestamp - halfDuration);
    let endTime = bestFrame.timestamp + halfDuration;

    const overlaps = matchedFrames.filter(f => {
      return f.timestamp >= startTime && f.timestamp <= endTime && f !== bestFrame;
    });

    if (overlaps.length > 0) {
      const minTime = Math.min(...overlaps.map(f => f.timestamp), bestFrame.timestamp);
      const maxTime = Math.max(...overlaps.map(f => f.timestamp), bestFrame.timestamp);
      const actualDuration = maxTime - minTime;
      
      if (actualDuration > targetDuration) {
        const center = (minTime + maxTime) / 2;
        startTime = center - targetDuration / 2;
        endTime = center + targetDuration / 2;
      } else {
        startTime = minTime;
        endTime = maxTime;
      }
    }

    return {
      startTime: Math.max(0, startTime),
      endTime,
      duration: endTime - startTime,
      centerFrame: bestFrame,
      supportingFrames: overlaps,
      averageSimilarity: (bestFrame.similarity + overlaps.reduce((sum, f) => sum + f.similarity, 0)) / (1 + overlaps.length)
    };
  }

  async processScriptClips(scriptClips, framesMetadata) {
    const results = [];

    for (let i = 0; i < scriptClips.length; i++) {
      const scriptClip = scriptClips[i];
      console.log(`\n处理镜头 ${i + 1}/${scriptClips.length}: ${scriptClip.description}`);

      const framesInRange = this.findFramesInTimeRange(
        framesMetadata,
        scriptClip.startTime,
        scriptClip.endTime
      );

      console.log(`  时间范围内有 ${framesInRange.length} 帧候选`);

      if (framesInRange.length === 0) {
        results.push({
          ...scriptClip,
          success: false,
          reason: 'No frames found in time range'
        });
        continue;
      }

      const matchedFrames = await this.matchClipToFrames(
        scriptClip.description,
        framesInRange,
        10
      );

      if (matchedFrames.length === 0) {
        results.push({
          ...scriptClip,
          success: false,
          reason: 'No matching frames found'
        });
        continue;
      }

      const segment = this.selectBestSegment(matchedFrames, scriptClip.duration);

      results.push({
        ...scriptClip,
        success: true,
        matchedFrames,
        selectedSegment: segment,
        bestSimilarity: matchedFrames[0].similarity
      });
    }

    return results;
  }

  buildTimeline(matchedResults) {
    const timeline = [];
    let currentTime = 0;

    for (const result of matchedResults) {
      if (!result.success || !result.selectedSegment) {
        continue;
      }

      const segment = result.selectedSegment;
      
      timeline.push({
        index: timeline.length,
        sourceStartTime: segment.startTime,
        sourceEndTime: segment.endTime,
        sourceDuration: segment.duration,
        timelineStartTime: currentTime,
        timelineEndTime: currentTime + segment.duration,
        description: result.description,
        shotType: segment.centerFrame.shotType,
        similarity: segment.averageSimilarity,
        centerTimestamp: segment.centerFrame.timestamp
      });

      currentTime += segment.duration;
    }

    return {
      clips: timeline,
      totalDuration: currentTime,
      clipCount: timeline.length
    };
  }
}

export default ShotMatcher;
