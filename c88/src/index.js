#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { extractFrames, extractFramesAdaptive, getVideoDuration } from './videoExtractor.js';
import { ClipExtractor } from './clipExtractor.js';
import { HNSWIndex } from './hnswIndex.js';
import { generateClipDecisions, extractClips, formatTime } from './videoClipper.js';
import { parseScriptFile, formatSecondsToTime } from './scriptParser.js';
import { ShotMatcher } from './shotMatcher.js';
import { savePremiereXML, saveEDL, generatePremiereXML, generateEditDecisionList } from './premiereXml.js';

const program = new Command();

program
  .name('video-retrieval')
  .description('视频内容检索工具 - 使用CLIP和HNSW进行自然语言视频检索')
  .version('3.0.0');

program
  .command('index')
  .description('为视频构建索引')
  .argument('<videoPath>', '视频文件路径')
  .option('-o, --output <dir>', '索引输出目录', './index')
  .option('-f, --fps <number>', '固定抽帧率（每秒帧数）', '1')
  .option('-a, --adaptive', '启用自适应抽帧（基于场景切换）', false)
  .option('--base-fps <number>', '自适应抽帧的基础帧率', '2')
  .option('--threshold <number>', '场景切换阈值 (0-1)', '0.3')
  .option('--min-interval <number>', '最小抽帧间隔(秒)', '0.5')
  .option('--max-interval <number>', '最大抽帧间隔(秒)', '5.0')
  .action(async (videoPath, options) => {
    try {
      console.log(`开始处理视频: ${videoPath}`);
      
      if (!await fs.pathExists(videoPath)) {
        console.error('错误: 视频文件不存在');
        process.exit(1);
      }

      const duration = await getVideoDuration(videoPath);
      console.log(`视频时长: ${formatTime(duration)}`);

      let frames;
      let tmpDir;
      let indexMetadata = {};

      if (options.adaptive) {
        console.log('\n=== 启用自适应抽帧模式 ===');
        const result = await extractFramesAdaptive(videoPath, {
          baseFps: parseFloat(options.baseFps),
          threshold: parseFloat(options.threshold),
          minInterval: parseFloat(options.minInterval),
          maxInterval: parseFloat(options.maxInterval)
        });
        
        frames = result.selectedFrames;
        tmpDir = result.tmpDir;
        
        indexMetadata = {
          mode: 'adaptive',
          baseFps: result.baseFps,
          threshold: parseFloat(options.threshold),
          totalFrames: result.allFrames.length,
          selectedFrames: result.selectedFrames.length,
          sceneChanges: result.sceneChanges.length,
          sceneChangeList: result.sceneChanges
        };
        
        console.log(`\n抽帧统计: 场景切换 ${result.sceneChanges.length} 次，选择了 ${frames.length} 帧`);
      } else {
        console.log('\n=== 使用固定抽帧模式 ===');
        console.log('正在提取帧...');
        const result = await extractFrames(videoPath, parseFloat(options.fps));
        frames = result.frames;
        tmpDir = result.tmpDir;
        
        indexMetadata = {
          mode: 'fixed',
          fps: parseFloat(options.fps),
          totalFrames: frames.length
        };
        
        console.log(`提取了 ${frames.length} 帧`);
      }

      console.log('\n初始化CLIP模型...');
      const clip = new ClipExtractor();
      
      const hasModel = await fs.pathExists(path.join(process.cwd(), 'models', 'clip-vit-base-patch32.onnx'));
      if (!hasModel) {
        console.log('警告: 未找到CLIP ONNX模型，使用模拟特征');
        console.log('请下载模型到 models/ 目录以获得真实结果');
      }

      console.log('\n构建HNSW索引...');
      const index = new HNSWIndex(512);
      index.init(frames.length);

      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        process.stdout.write(`\r处理帧 ${i + 1}/${frames.length} (${frame.frameType || 'base'})`);
        
        let feature;
        if (hasModel) {
          feature = await clip.extractImageFeature(frame.path);
        } else {
          feature = clip.simulateTextFeature(`frame_${i}_${frame.timestamp}`);
        }
        
        index.addPoint(feature, {
          index: frame.index,
          timestamp: frame.timestamp,
          frameType: frame.frameType || 'base',
          sceneChange: frame.sceneChange || 0
        });
      }
      console.log('\n');

      console.log(`保存索引到: ${options.output}`);
      index.save(options.output);
      
      await fs.writeJSON(
        path.join(options.output, 'indexMetadata.json'),
        indexMetadata,
        { spaces: 2 }
      );

      tmpDir.removeCallback();
      
      console.log('\n=== 索引构建完成! ===');
      console.log(`总帧数: ${frames.length}`);
      if (indexMetadata.mode === 'adaptive') {
        console.log(`模式: 自适应抽帧`);
        console.log(`场景切换次数: ${indexMetadata.sceneChanges}`);
      } else {
        console.log(`模式: 固定帧率 (${indexMetadata.fps}fps)`);
      }
    } catch (error) {
      console.error('错误:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  });

program
  .command('search')
  .description('搜索视频内容')
  .argument('<query>', '自然语言查询')
  .option('-i, --index <dir>', '索引目录', './index')
  .option('-v, --video <path>', '视频文件路径（用于截取片段)')
  .option('-n, --num <number>', '返回结果数量', '3')
  .option('-o, --output <dir>', '片段输出目录', './clips')
  .option('--no-extract', '不截取视频片段')
  .option('--show-frame-type', '显示帧类型信息')
  .action(async (query, options) => {
    try {
      console.log(`查询: ${query}`);
      
      if (!await fs.pathExists(options.index)) {
        console.error('错误: 索引目录不存在，请先运行 index 命令');
        process.exit(1);
      }

      console.log('加载索引...');
      const index = new HNSWIndex(512);
      index.load(options.index);
      console.log(`索引包含 ${index.length} 帧`);
      
      const indexMetaPath = path.join(options.index, 'indexMetadata.json');
      if (await fs.pathExists(indexMetaPath)) {
        const indexMeta = await fs.readJSON(indexMetaPath);
        console.log(`索引模式: ${indexMeta.mode === 'adaptive' ? '自适应抽帧' : '固定帧率'}`);
      }

      console.log('提取文本特征...');
      const clip = new ClipExtractor();
      const textFeature = await clip.extractTextFeature(query);

      console.log('搜索最相似的帧...');
      const results = index.query(textFeature, parseInt(options.num));
      
      results.forEach(r => r.query = query);

      console.log('\n=== 搜索结果 ===');
      results.forEach((result, idx) => {
        let line = `${idx + 1}. 时间戳: ${formatTime(result.timestamp)} (${result.timestamp.toFixed(2)}s) - 相似度: ${(result.similarity * 100).toFixed(2)}%`;
        if (options.showFrameType && result.frameType) {
          line += ` [${result.frameType}]`;
        }
        console.log(line);
      });

      let videoDuration = 0;
      if (options.video) {
        videoDuration = await getVideoDuration(options.video);
      }

      const decisions = generateClipDecisions(results, videoDuration);
      
      const decisionsPath = path.join(options.output, 'decisions.json');
      await fs.ensureDir(options.output);
      await fs.writeJSON(decisionsPath, decisions, { spaces: 2 });
      console.log(`\n剪辑决策已保存到: ${decisionsPath}`);

      if (options.extract && options.video) {
        console.log('\n正在截取视频片段...');
        const clipPaths = await extractClips(options.video, decisions, options.output);
        console.log('已截取的片段:');
        clipPaths.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
      }

      console.log('\n完成!');
    } catch (error) {
      console.error('错误:', error.message);
      process.exit(1);
    }
  });

program
  .command('info')
  .description('显示索引信息')
  .option('-i, --index <dir>', '索引目录', './index')
  .action(async (options) => {
    try {
      if (!await fs.pathExists(options.index)) {
        console.error('错误: 索引目录不存在');
        process.exit(1);
      }

      const indexMetaPath = path.join(options.index, 'indexMetadata.json');
      if (await fs.pathExists(indexMetaPath)) {
        const meta = await fs.readJSON(indexMetaPath);
        console.log('=== 索引信息 ===');
        console.log(`模式: ${meta.mode === 'adaptive' ? '自适应抽帧' : '固定帧率'}`);
        if (meta.mode === 'adaptive') {
          console.log(`基础帧率: ${meta.baseFps}fps`);
          console.log(`场景切换阈值: ${meta.threshold}`);
          console.log(`总帧数: ${meta.totalFrames}`);
          console.log(`已选择帧数: ${meta.selectedFrames}`);
          console.log(`场景切换次数: ${meta.sceneChanges}`);
          if (meta.sceneChangeList && meta.sceneChangeList.length > 0) {
            console.log('\n场景切换时间点:');
            meta.sceneChangeList.slice(0, 10).forEach((sc, i) => {
              console.log(`  ${i + 1}. ${formatTime(sc.timestamp)} (变化: ${(sc.sceneChange * 100).toFixed(1)}%)`);
            });
            if (meta.sceneChangeList.length > 10) {
              console.log(`  ... 还有 ${meta.sceneChangeList.length - 10} 个场景切换`);
            }
          }
        } else {
          console.log(`帧率: ${meta.fps}fps`);
          console.log(`总帧数: ${meta.totalFrames}`);
        }
      } else {
        console.log('索引元数据不存在 (可能是旧版本索引)');
      }

      const index = new HNSWIndex(512);
      index.load(options.index);
      console.log(`\n索引包含: ${index.length} 个向量`);
    } catch (error) {
      console.error('错误:', error.message);
      process.exit(1);
    }
  });

program
  .command('script')
  .description('剧本编辑模式 - 根据剧本自动匹配片段并生成剪辑')
  .argument('<scriptPath>', '剧本文件路径')
  .requiredOption('-i, --index <dir>', '索引目录', './index')
  .requiredOption('-v, --video <path>', '视频文件路径')
  .option('-o, --output <dir>', '输出目录', './script-output')
  .option('--format <format>', '输出格式: premiere, edl, both, clips', 'both')
  .option('--fps <number>', '帧率', '25')
  .option('--width <number>', '视频宽度', '1920')
  .option('--height <number>', '视频高度', '1080')
  .action(async (scriptPath, options) => {
    try {
      console.log('=== 剧本编辑模式 ===\n');
      
      if (!await fs.pathExists(scriptPath)) {
        console.error('错误: 剧本文件不存在');
        process.exit(1);
      }

      if (!await fs.pathExists(options.index)) {
        console.error('错误: 索引目录不存在，请先运行 index 命令');
        process.exit(1);
      }

      if (!await fs.pathExists(options.video)) {
        console.error('错误: 视频文件不存在');
        process.exit(1);
      }

      console.log('1. 解析剧本文件...');
      const script = await parseScriptFile(scriptPath);
      console.log(`   解析完成: ${script.totalClips} 个镜头，总时长 ${formatTime(script.totalDuration)}`);
      
      console.log('\n2. 镜头列表:');
      script.clips.forEach((clip, idx) => {
        console.log(`   ${idx + 1}. [${formatTime(clip.startTime)} - ${formatTime(clip.endTime)}] ${clip.description}`);
      });

      console.log('\n3. 加载索引...');
      const index = new HNSWIndex(512);
      index.load(options.index);
      console.log(`   索引包含 ${index.length} 帧`);

      console.log('\n4. 加载CLIP模型...');
      const clip = new ClipExtractor();
      
      const hasModel = await fs.pathExists(path.join(process.cwd(), 'models', 'clip-vit-base-patch32.onnx'));
      if (!hasModel) {
        console.log('   警告: 未找到CLIP ONNX模型，使用模拟特征匹配');
      }

      console.log('\n5. 匹配镜头特征...');
      const matchedResults = [];
      
      for (const scriptClip of script.clips) {
        process.stdout.write(`   匹配: ${scriptClip.description}... `);
        
        const queryFeature = await clip.extractTextFeature(scriptClip.description);
        const results = index.query(queryFeature, 10);
        
        const framesInRange = results.filter(r => 
          r.timestamp >= scriptClip.startTime && r.timestamp <= scriptClip.endTime
        );
        
        if (framesInRange.length > 0) {
          const bestMatch = framesInRange[0];
          matchedResults.push({
            ...scriptClip,
            success: true,
            matchedFrame: bestMatch,
            similarity: bestMatch.similarity
          });
          process.stdout.write(`✓ 相似度 ${(bestMatch.similarity * 100).toFixed(1)}%\n`);
        } else {
          matchedResults.push({
            ...scriptClip,
            success: false,
            reason: 'No matching frames in time range'
          });
          process.stdout.write('✗ 未找到匹配\n');
        }
      }

      console.log('\n6. 构建时间线...');
      const timeline = {
        clips: [],
        totalDuration: 0
      };
      
      let currentTime = 0;
      matchedResults.filter(r => r.success).forEach((result, idx) => {
        const segment = {
          index: idx,
          sourceStartTime: result.matchedFrame.timestamp - 1,
          sourceEndTime: result.matchedFrame.timestamp + result.duration - 1,
          sourceDuration: result.duration,
          timelineStartTime: currentTime,
          timelineEndTime: currentTime + result.duration,
          description: result.description,
          similarity: result.matchedFrame.similarity
        };
        segment.sourceStartTime = Math.max(0, segment.sourceStartTime);
        timeline.clips.push(segment);
        currentTime += result.duration;
      });
      timeline.totalDuration = currentTime;
      
      console.log(`   时间线构建完成: ${timeline.clips.length} 个片段，总时长 ${formatTime(timeline.totalDuration)}`);

      console.log('\n7. 生成输出文件...');
      await fs.ensureDir(options.output);
      
      const resultsSummary = {
        script: script,
        matchedResults: matchedResults.map(r => ({
          startTime: r.startTime,
          endTime: r.endTime,
          description: r.description,
          success: r.success,
          similarity: r.similarity,
          matchedTimestamp: r.matchedFrame?.timestamp
        })),
        timeline: timeline
      };
      
      await fs.writeJSON(
        path.join(options.output, 'results.json'),
        resultsSummary,
        { spaces: 2 }
      );
      console.log('   ✓ results.json');

      if (options.format === 'premiere' || options.format === 'both') {
        await savePremiereXML(
          path.join(options.output, 'premiere_project.xml'),
          timeline,
          options.video,
          {
            fps: parseFloat(options.fps),
            width: parseInt(options.width),
            height: parseInt(options.height)
          }
        );
        console.log('   ✓ premiere_project.xml');
      }

      if (options.format === 'edl' || options.format === 'both') {
        await saveEDL(
          path.join(options.output, 'edit_decision_list.edl'),
          timeline,
          options.video
        );
        console.log('   ✓ edit_decision_list.edl');
      }

      if (options.format === 'clips' || options.format === 'both') {
        console.log('\n8. 截取视频片段...');
        const clipPromises = timeline.clips.map(async (clip, idx) => {
          try {
            const decisions = generateClipDecisions(
              [{ timestamp: (clip.sourceStartTime + clip.sourceEndTime) / 2, similarity: 1 }],
              clip.sourceDuration
            );
            decisions.clips[0].startTime = clip.sourceStartTime;
            decisions.clips[0].endTime = clip.sourceEndTime;
            decisions.clips[0].duration = clip.sourceDuration;
            
            const clipPaths = await extractClips(options.video, decisions, options.output);
            if (clipPaths && clipPaths.length > 0) {
              const oldPath = clipPaths[0];
              const newPath = path.join(options.output, `clip_${(idx + 1).toString().padStart(3, '0')}${path.extname(oldPath)}`);
              await fs.rename(oldPath, newPath);
              return newPath;
            }
          } catch (e) {
            console.log(`   警告: 片段 ${idx + 1} 截取失败: ${e.message}`);
          }
          return null;
        });
        
        const clipResults = await Promise.all(clipPromises);
        const successfulClips = clipResults.filter(c => c !== null);
        console.log(`   ✓ 已截取 ${successfulClips.length} 个片段`);
      }

      console.log('\n=== 完成! ===');
      console.log(`输出目录: ${options.output}`);
      console.log(`成功匹配: ${matchedResults.filter(r => r.success).length}/${matchedResults.length} 个镜头`);
      
    } catch (error) {
      console.error('错误:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  });

program
  .command('template')
  .description('生成剧本模板文件')
  .argument('<outputPath>', '输出文件路径')
  .action(async (outputPath) => {
    const template = `# 视频剪辑剧本模板
# 格式: 开始时间-结束时间 镜头描述
# 时间格式: MM:SS 或 HH:MM:SS

00:00-00:05 远景，全景展示
00:05-00:10 中景，人物出场
00:10-00:15 特写，人物表情
00:15-00:20 仰视，动作镜头
00:20-00:25 俯视，场景展示

# 支持的镜头类型:
# - 远景/全景 (long shot, wide shot)
# - 中景 (medium shot)
# - 近景 (medium close up)
# - 特写 (close up)
# - 大特写 (extreme close up)
# - 仰视 (low angle)
# - 俯视 (high angle)
# - 顶拍 (overhead)
# - 主观镜头/第一视角 (POV)
`;
    
    await fs.writeFile(outputPath, template, 'utf-8');
    console.log(`剧本模板已生成: ${outputPath}`);
  });

program.parse();
