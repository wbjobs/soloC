import os
import sys
import tempfile
import numpy as np
from PIL import Image
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from core.model_manager import ModelManager
from core.image_processor import ImageProcessor
from core.style_transfer import StyleTransferModel

def create_test_image(size=(128, 128), grayscale=True):
    """创建测试图片"""
    if grayscale:
        img_array = np.random.randint(50, 200, (*size, 1), dtype=np.uint8)
        img_array = np.repeat(img_array, 3, axis=2)
    else:
        x = np.linspace(0, 1, size[0])
        y = np.linspace(0, 1, size[1])
        xx, yy = np.meshgrid(y, x)
        img_array = np.stack([xx, yy, np.zeros_like(xx)], axis=2)
        img_array = (img_array * 255).astype(np.uint8)
    
    return Image.fromarray(img_array)

def test_style_transfer_model():
    print("=" * 60)
    print("测试风格迁移模型")
    print("=" * 60)
    
    print("\n1. 初始化风格迁移模型...")
    style_model = StyleTransferModel()
    
    print(f"可用风格: {[style_model.get_style_name(k) for k in style_model.STYLES]}")
    
    print("\n2. 创建测试图片...")
    test_img = create_test_image()
    print(f"测试图片尺寸: {test_img.size}")
    
    print("\n3. 测试不同风格...")
    styles_to_test = ['van_gogh', 'ukiyoe', 'watercolor', 'oil_painting', 'cubism']
    
    temp_dir = tempfile.mkdtemp(prefix="style_test_")
    print(f"结果将保存到: {temp_dir}")
    
    test_img.save(os.path.join(temp_dir, "original.jpg"))
    
    for style_key in styles_to_test:
        print(f"\n  测试风格: {style_model.get_style_name(style_key)}")
        
        for strength in [0.3, 0.5, 0.8]:
            print(f"    强度: {strength:.1f}...", end=" ")
            
            result = style_model.apply_style(test_img, style_key, strength=strength)
            print(f"完成，尺寸: {result.size}")
            
            filename = f"{style_key}_strength_{strength:.1f}.jpg"
            result.save(os.path.join(temp_dir, filename))
    
    print("\n4. 测试'无风格'选项...")
    result = style_model.apply_style(test_img, 'none', strength=0.5)
    print(f"  原始与结果是否相同: {result.size == test_img.size}")
    
    print("\n5. 测试强度为0的情况...")
    result = style_model.apply_style(test_img, 'van_gogh', strength=0)
    print(f"  强度为0时是否返回原图: {result.size == test_img.size}")
    
    print("\n" + "=" * 60)
    print("风格迁移模型测试完成!")
    print(f"测试结果保存目录: {temp_dir}")
    print("=" * 60)
    
    return True

def test_full_pipeline():
    print("\n" + "=" * 60)
    print("测试完整流程: 超分 -> 上色 -> 风格迁移")
    print("=" * 60)
    
    print("\n1. 加载所有模型...")
    model_manager = ModelManager()
    success, msg = model_manager.load_models()
    print(f"  {msg}")
    
    if not success:
        print("  模型加载失败，跳过完整测试")
        return False
    
    image_processor = ImageProcessor()
    
    print("\n2. 创建测试图片...")
    temp_dir = tempfile.mkdtemp(prefix="full_pipeline_")
    test_img_path = os.path.join(temp_dir, "test_input.jpg")
    
    test_img = create_test_image(size=(128, 128), grayscale=True)
    test_img.save(test_img_path)
    print(f"  输入图片: {test_img_path}, 尺寸: {test_img.size}")
    
    print("\n3. 测试完整处理流程...")
    styles = ['none', 'van_gogh', 'watercolor', 'oil_painting']
    
    for style_key in styles:
        style_name = model_manager.style_model.get_style_name(style_key)
        print(f"\n  风格: {style_name}...", end=" ")
        
        result = image_processor.process_image(
            test_img_path,
            model_manager,
            style_key=style_key,
            style_strength=0.6
        )
        
        print(f"完成，输出尺寸: {result.size}")
        
        output_path = os.path.join(temp_dir, f"output_{style_key}.png")
        result.save(output_path)
    
    print("\n" + "=" * 60)
    print("完整流程测试完成!")
    print(f"测试结果保存目录: {temp_dir}")
    print("=" * 60)
    
    return True

def main():
    all_passed = True
    
    try:
        all_passed &= test_style_transfer_model()
    except Exception as e:
        print(f"\n✗ 风格迁移测试失败: {e}")
        import traceback
        traceback.print_exc()
        all_passed = False
    
    try:
        all_passed &= test_full_pipeline()
    except Exception as e:
        print(f"\n✗ 完整流程测试失败: {e}")
        import traceback
        traceback.print_exc()
        all_passed = False
    
    print("\n" + "=" * 60)
    if all_passed:
        print("✓ 所有测试通过!")
    else:
        print("✗ 部分测试失败")
    print("=" * 60)
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
