# 基因共线性分析API

一个用于基因共线性分析的后端API服务，支持：
- GFF3基因位置文件解析
- BLAST比对结果解析
- MCScan算法共线性块识别
- 共线性点图和染色体圈图生成（交互式HTML）
- 祖先核型重建（最小断裂事件推断）
- PDF/SVG结果导出

## 安装

```bash
pip install -r requirements.txt
```

## 运行

```bash
python main.py
```

API文档将在 http://localhost:8000/docs 可用
