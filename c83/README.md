# AI 图片增强工具 - 超分辨率与上色

一个基于 PyQt5 和 ONNX Runtime 的桌面应用，用于对低分辨率黑白图片进行4倍超分辨率放大和智能上色。

## 功能特性

- 🖼️ **拖拽上传**: 支持拖拽图片到列表进行处理
- 🚀 **4倍超分辨率**: 使用 Real-ESRGAN 模型进行图像放大
- 🎨 **智能上色**: 使用 UNet 模型为黑白图像自动上色
- 🔄 **实时预览**: 对比滑块，可对比处理前后的效果
- 📦 **批量处理**: 支持同时处理多张图片
- 💻 **GPU加速**: 自动检测并使用 GPU (CUDA/DML)，降级到 CPU
- 💾 **多格式导出**: 支持导出为 PNG 或 WebP 格式

## 安装依赖

```bash
pip install -r requirements.txt
```

如需 GPU 加速：
```bash
pip install onnxruntime-gpu
```

## 运行程序

```bash
python main.py
```

## 使用说明

1. **添加图片**: 点击"添加图片"按钮或直接拖拽图片到左侧列表
2. **选择图片**: 在列表中点击要处理的图片
3. **处理图片**: 点击"处理当前图片"进行单张处理
4. **批量处理**: 点击"批量处理所有"处理列表中的全部图片
5. **对比效果**: 使用右侧预览区域的滑块拖动对比效果
6. **导出图片**: 点击"导出结果"将处理后的图片保存为 PNG 或 WebP

## 模型说明

程序首次运行时会自动创建占位模型用于演示。为获得最佳效果，请下载真实的 ONNX 模型：

- **RealESRGAN_x4plus.onnx**: 超分辨率模型
- **UNet_colorization.onnx**: 上色模型

将模型文件放置在 `models/` 目录下。

## 模型转换指南

### Real-ESRGAN 转 ONNX

1. 下载官方 PyTorch 模型: RealESRGAN_x4plus.pth
2. 使用以下代码转换:

```python
import torch
from basicsr.archs.rrdbnet_arch import RRDBNet

model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, 
                num_block=23, num_grow_ch=32, scale=4)
model.load_state_dict(torch.load('RealESRGAN_x4plus.pth')['params_ema'])
model.eval()

dummy_input = torch.randn(1, 3, 256, 256)
torch.onnx.export(
    model, dummy_input, 'models/RealESRGAN_x4plus.onnx',
    opset_version=11,
    input_names=['input'],
    output_names=['output'],
    dynamic_axes={'input': {2: 'height', 3: 'width'},
                  'output': {2: 'height', 3: 'width'}}
)
```

### UNet 上色模型转 ONNX

参考 https://github.com/richzhang/colorization 项目进行转换。

## 项目结构

```
.
├── main.py                 # 程序入口
├── ui/
│   ├── __init__.py
│   ├── main_window.py      # 主窗口
│   └── image_preview.py    # 预览组件
├── core/
│   ├── __init__.py
│   ├── model_manager.py    # 模型管理
│   └── image_processor.py  # 图像处理
├── models/                 # 模型目录
├── requirements.txt
└── README.md
```

## 技术栈

- **GUI 框架**: PyQt5
- **图像处理**: Pillow, OpenCV
- **推理引擎**: ONNX Runtime (支持 CPU/GPU)
- **模型格式**: ONNX

## 许可证

MIT License
