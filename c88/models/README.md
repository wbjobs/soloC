# Models Directory

Place your CLIP ONNX models here.

## Required Files

1. `clip-vit-base-patch32.onnx` - Image encoder
2. `clip-text-vit-base-patch32.onnx` - Text encoder

## How to Get Models

You can export CLIP models to ONNX format using:

- Hugging Face Transformers + `torch.onnx.export()`
- `clip-onnx` packages from npm
- ONNX Model Zoo

If models are not present, the tool will use simulated features for demonstration purposes.
