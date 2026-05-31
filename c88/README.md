# 视频内容检索工具

使用CLIP模型和HNSW索引的命令行视频检索工具，支持自然语言查询和剧本编辑模式。

## 功能特性

- 🎬 **视频抽帧**: 支持固定帧率和自适应抽帧两种模式
- 🔄 **场景切换检测**: 基于帧间像素差异的自适应抽帧，避免遗漏关键动作
- 🧠 **CLIP特征提取**: 使用本地ONNX模型提取图像和文本特征
- 🔍 **HNSW索引**: 高效的近似最近邻搜索
- 📝 **自然语言查询**: 用中文描述查找视频片段
- 📜 **剧本编辑模式**: 根据剧本时间线自动匹配镜头
- 🎞️ **Premiere/EDL导出**: 直接导出可导入剪辑软件的项目文件
- ✂️ **自动剪辑**: 生成剪辑决策并自动截取视频片段
- 📊 **JSON输出**: 结构化的搜索结果和剪辑决策
- ℹ️ **索引信息查询**: 查看索引构建详情

## 安装依赖

```bash
npm install
```

### 系统要求

- Node.js 16+
- FFmpeg (已安装并在PATH中)

## 下载CLIP ONNX模型

工具需要CLIP的ONNX模型才能正常工作。请下载以下模型并放入 `models/` 目录：

1. **图像编码器**: `clip-vit-base-patch32.onnx`
2. **文本编码器**: `clip-text-vit-base-patch32.onnx`

### 模型下载方式

可以从以下途径获取：
- 使用 Hugging Face Transformers 导出
- 从 ONNX Model Zoo 下载
- 使用 `clip-onnx` 相关项目导出

**注意**: 如果没有模型文件，工具会使用模拟特征进行演示。

## 使用方法

### 1. 构建视频索引

#### 固定帧率模式（默认）

```bash
node src/index.js index <videoPath> [options]
```

**参数:**
- `videoPath`: 视频文件路径

**固定帧率选项:**
- `-o, --output <dir>`: 索引输出目录 (默认: ./index)
- `-f, --fps <number>`: 抽帧率，每秒帧数 (默认: 1)

**示例:**
```bash
node src/index.js index ./video.mp4 -o ./my-index
```

---

#### 自适应抽帧模式（推荐用于高动态场景，如体育比赛）

```bash
node src/index.js index <videoPath> -a [options]
```

**自适应抽帧选项:**
- `-a, --adaptive`: 启用自适应抽帧模式
- `--base-fps <number>`: 基础抽帧率（默认: 2）
- `--threshold <number>`: 场景切换阈值 0-1（默认: 0.3，值越小越敏感）
- `--min-interval <number>`: 最小抽帧间隔（秒，默认: 0.5）
- `--max-interval <number>`: 最大抽帧间隔（秒，默认: 5.0）

**示例（体育比赛推荐配置）:**
```bash
node src/index.js index ./basketball.mp4 -a --threshold 0.25 --min-interval 0.3
```

**工作原理:**
1. 首先按基础帧率（如2fps）抽取所有帧
2. 计算相邻帧的像素差异
3. 当差异超过阈值时认为场景发生了变化
4. 选择该帧进行特征提取
5. 即使没有场景变化，也会按最大间隔抽取帧

---

### 2. 搜索视频内容

```bash
node src/index.js search <query> [options]
```

**参数:**
- `query`: 自然语言查询，如 "一个人跳起来接球"

**选项:**
- `-i, --index <dir>`: 索引目录 (默认: ./index)
- `-v, --video <path>`: 视频文件路径（用于截取片段）
- `-n, --num <number>`: 返回结果数量 (默认: 3)
- `-o, --output <dir>`: 片段输出目录 (默认: ./clips)
- `--no-extract`: 不截取视频片段
- `--show-frame-type`: 显示帧类型信息（场景切换帧/基准帧/周期帧）

**示例:**
```bash
# 仅搜索，不截取
node src/index.js search "一个人跳起来接球"

# 搜索并截取片段
node src/index.js search "篮球比赛投篮" -v ./video.mp4 -n 5 --show-frame-type
```

---

### 3. 剧本编辑模式 ✨ 新增

根据剧本时间线自动匹配镜头并生成剪辑项目。

#### 3.1 生成剧本模板

```bash
node src/index.js template <outputPath>
```

**示例:**
```bash
node src/index.js template ./my-script.txt
```

#### 3.2 剧本文件格式

```txt
# 格式: 开始时间-结束时间 镜头描述
# 时间格式: MM:SS 或 HH:MM:SS

00:00-00:05 远景，全景展示
00:05-00:10 中景，人物出场
00:10-00:15 特写，人物表情
00:15-00:20 仰视，动作镜头
00:20-00:25 俯视，场景展示
```

**支持的镜头类型:**
- 远景/全景 (long shot, wide shot)
- 中景 (medium shot)
- 近景 (medium close up)
- 特写 (close up)
- 大特写 (extreme close up)
- 仰视 (low angle)
- 俯视 (high angle)
- 顶拍 (overhead)
- 主观镜头/第一视角 (POV)

#### 3.3 运行剧本编辑

```bash
node src/index.js script <scriptPath> -i <indexDir> -v <videoPath> [options]
```

**参数:**
- `scriptPath`: 剧本文件路径

**选项:**
- `-i, --index <dir>`: 索引目录 (必须)
- `-v, --video <path>`: 视频文件路径 (必须)
- `-o, --output <dir>`: 输出目录 (默认: ./script-output)
- `--format <format>`: 输出格式: premiere, edl, both, clips (默认: both)
- `--fps <number>`: 视频帧率 (默认: 25)
- `--width <number>`: 视频宽度 (默认: 1920)
- `--height <number>`: 视频高度 (默认: 1080)

**示例:**
```bash
# 完整流程：生成Premiere XML和EDL，同时截取片段
node src/index.js script ./my-script.txt -i ./index -v ./video.mp4

# 只导出Premiere项目文件
node src/index.js script ./my-script.txt -i ./index -v ./video.mp4 --format premiere

# 只截取视频片段
node src/index.js script ./my-script.txt -i ./index -v ./video.mp4 --format clips
```

**输出文件:**
- `results.json`: 匹配结果和时间线数据
- `premiere_project.xml`: 可导入Adobe Premiere的项目文件
- `edit_decision_list.edl`: 剪辑决策列表（可导入大多数剪辑软件）
- `clip_001.mp4`, `clip_002.mp4`...: 自动截取的视频片段

---

### 4. 查看索引信息

```bash
node src/index.js info [options]
```

**选项:**
- `-i, --index <dir>`: 索引目录 (默认: ./index)

**示例:**
```bash
node src/index.js info -i ./my-index
```

**输出示例:**
```
=== 索引信息 ===
模式: 自适应抽帧
基础帧率: 2fps
场景切换阈值: 0.3
总帧数: 240
已选择帧数: 85
场景切换次数: 42

场景切换时间点:
  1. 00:00:02 (变化: 45.2%)
  2. 00:00:05 (变化: 38.7%)
  ...
```

---

## 输出说明

### 搜索结果

```
=== 搜索结果 ===
1. 时间戳: 00:00:15 (15.00s) - 相似度: 95.23% [scene_change]
2. 时间戳: 00:00:42 (42.00s) - 相似度: 89.56% [periodic]
3. 时间戳: 00:01:23 (83.00s) - 相似度: 87.12% [base]
```

**帧类型说明:**
- `base`: 基准帧（第一帧）
- `scene_change`: 场景切换帧（画面有显著变化）
- `periodic`: 周期帧（按最大间隔抽取）
- `candidate`: 候选帧（未被选中）

### Premiere XML导入

1. 打开Adobe Premiere Pro
2. 选择 `文件 > 导入`
3. 选择生成的 `premiere_project.xml` 文件
4. 项目会自动创建序列并排列所有剪辑片段

### 剪辑决策 JSON (decisions.json)

```json
{
  "query": "一个人跳起来接球",
  "videoDuration": 120.5,
  "videoDurationFormatted": "00:02:00",
  "totalResults": 3,
  "clips": [
    {
      "id": 1,
      "timestamp": 15,
      "timestampFormatted": "00:00:15",
      "startTime": 13,
      "startTimeFormatted": "00:00:13",
      "endTime": 17,
      "endTimeFormatted": "00:00:17",
      "duration": 4,
      "similarity": 0.9523,
      "rank": 1
    }
  ]
}
```

## 项目结构

```
.
├── src/
│   ├── index.js           # 主入口，命令行接口
│   ├── sceneDetector.js   # 场景切换检测模块
│   ├── scriptParser.js    # 剧本解析模块
│   ├── shotMatcher.js     # 镜头特征匹配模块
│   ├── premiereXml.js     # Premiere XML生成模块
│   ├── videoExtractor.js  # 视频抽帧模块
│   ├── clipExtractor.js   # CLIP特征提取模块
│   ├── hnswIndex.js       # HNSW索引模块
│   └── videoClipper.js    # 视频剪辑模块
├── models/                # CLIP ONNX模型目录
├── index/                 # 生成的索引文件
│   ├── index.hnsw         # HNSW索引
│   ├── metadata.json      # 帧元数据
│   └── indexMetadata.json # 索引构建参数
├── clips/                 # 输出的视频片段
├── package.json
└── README.md
```

## 工作原理

### 自适应抽帧工作流程：

1. **抽帧阶段**:
   - 固定模式: 使用FFmpeg按指定帧率提取帧
   - 自适应模式: 先按较高基础帧率提取，然后通过帧间像素差异检测场景变化，只在画面变化时抽取关键帧

2. **特征提取**: 使用CLIP图像编码器将每一帧转换为512维特征向量

3. **索引构建**: 将所有帧的特征向量存入HNSW索引

4. **查询阶段**: 使用CLIP文本编码器将查询文本转换为特征向量

5. **相似度搜索**: 在HNSW索引中查找与查询向量最相似的帧

6. **结果输出**: 返回最相似的时间戳，生成剪辑决策，可选截取视频片段

### 剧本编辑工作流程：

1. **剧本解析**: 解析剧本文件，提取每个镜头的时间范围和描述

2. **特征匹配**: 使用CLIP将镜头描述转换为特征向量，在索引中搜索匹配的帧

3. **时间线构建**: 按剧本顺序排列匹配的片段，构建编辑时间线

4. **项目导出**: 生成Premiere XML和EDL文件，可直接导入专业剪辑软件

## 自适应抽帧调优指南

### 不同场景的推荐配置：

| 场景类型 | 阈值 | 最小间隔 | 最大间隔 | 说明
|---|---|---|---|---|
| 体育比赛 | 0.20-0.25 | 0.3-0.5s | 3-5s | 动作快速频繁
| 动作电影 | 0.25-0.30 | 0.5-1.0s | 5-10s | 动作中等频繁
| 纪录片 | 0.30-0.40 | 1.0-2.0s | 10-20s | 场景变化较慢
| 监控录像 | 0.15-0.20 | 0.2-0.5s | 2-5s | 需要捕捉细微变化

## 技术栈

- **Commander.js**: 命令行接口框架
- **fluent-ffmpeg**: FFmpeg封装，视频处理
- **onnxruntime-node**: ONNX模型推理
- **hnswlib-node**: HNSW近似最近邻搜索
- **sharp**: 图像处理（帧间差异计算）
- **fs-extra**: 文件系统操作

## 常见问题

**Q: 为什么需要FFmpeg?**
A: FFmpeg用于视频抽帧和片段截取，是视频处理的标准工具。

**Q: 没有CLIP模型可以使用吗?**
A: 可以，但会使用模拟特征，结果不具有实际语义相似度。建议下载真实模型。

**Q: 支持哪些视频格式?**
A: 支持FFmpeg支持的所有格式，包括MP4、AVI、MOV、MKV等。

**Q: 自适应抽帧比固定帧率好在哪里?**
A: 自适应抽帧能在画面变化大（如投篮、扣篮等关键动作）时自动抽帧，避免每秒1帧可能错过这些关键动作，同时在动作稀疏时又不会过度抽帧。

**Q: 如何提高搜索精度?**
A: 1) 使用更高质量的CLIP模型 (如 ViT-L/14)；2) 使用自适应抽帧并调整阈值；3) 使用更详细的查询描述；4) 适当提高基础帧率。

**Q: 自适应抽帧会很慢怎么办?**
A: 自适应抽帧需要先抽取较高帧率的帧，然后计算帧间差异计算，这会增加一些时间，但可以大大减少后续特征提取和索引构建的时间，总体上更高效。

**Q: Premiere XML支持哪些版本?**
A: 生成的XML文件兼容Adobe Premiere Pro CC 2018及以上版本。

## 许可证

MIT
