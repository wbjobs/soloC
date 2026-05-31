from flask import Flask, jsonify, send_file, request
from flask_cors import CORS
import numpy as np
import trimesh
import os
import json
import shutil
from io import BytesIO
from PIL import Image
import base64

app = Flask(__name__)
CORS(app, max_age=3600)

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')
TIMESERIES_DIR = os.path.join(MODEL_DIR, 'timeseries')
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TIMESERIES_DIR, exist_ok=True)

model_info = None
sections_cache = {}
timeseries_cache = {}
timeseries_metadata = {
    'models': [],
    'interpolation_steps': 10
}

def ensure_sample_model():
    """创建示例地质模型"""
    model_path = os.path.join(MODEL_DIR, 'geological_model.obj')
    if os.path.exists(model_path):
        return True
    
    mesh = create_sample_geological_mesh()
    mesh.export(model_path)
    
    properties = create_sample_properties()
    with open(os.path.join(MODEL_DIR, 'rock_properties.json'), 'w') as f:
        json.dump(properties, f, indent=2)
    
    return True

def create_sample_geological_mesh():
    """创建示例地质模型 - 多层结构"""
    size = 100
    layers = []
    
    layer_heights = [0, 20, 40, 60, 80, 100]
    layer_colors = [
        [0.6, 0.4, 0.2],
        [0.5, 0.3, 0.15],
        [0.4, 0.35, 0.25],
        [0.3, 0.25, 0.2],
        [0.2, 0.15, 0.1]
    ]
    
    vertices = []
    faces = []
    vertex_offset = 0
    
    for i in range(len(layer_heights) - 1):
        z1 = layer_heights[i]
        z2 = layer_heights[i + 1]
        
        layer_vertices = [
            [0, 0, z1], [size, 0, z1], [size, size, z1], [0, size, z1],
            [0, 0, z2], [size, 0, z2], [size, size, z2], [0, size, z2]
        ]
        
        noise = np.random.normal(0, 3, (8, 3))
        noise[:, 2] *= 0.5
        layer_vertices = np.array(layer_vertices) + noise
        
        for v in layer_vertices:
            vertices.append(v.tolist())
        
        layer_faces = [
            [0, 1, 2], [0, 2, 3],
            [4, 6, 5], [4, 7, 6],
            [0, 4, 5], [0, 5, 1],
            [1, 5, 6], [1, 6, 2],
            [2, 6, 7], [2, 7, 3],
            [3, 7, 4], [3, 4, 0]
        ]
        
        for f in layer_faces:
            faces.append([f[0] + vertex_offset, f[1] + vertex_offset, f[2] + vertex_offset])
        
        vertex_offset += 8
    
    vertices = np.array(vertices)
    faces = np.array(faces)
    
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces)
    
    return mesh

def create_sample_properties():
    """创建示例岩石属性"""
    return {
        "layers": [
            {
                "name": "表土层",
                "depth_range": [0, 20],
                "properties": {
                    "岩性": "第四系松散堆积物",
                    "密度": "1.8-2.0 g/cm³",
                    "孔隙度": "30-40%",
                    "渗透率": "高",
                    "抗压强度": "0.5-1.0 MPa",
                    "弹性模量": "0.1-0.5 GPa"
                }
            },
            {
                "name": "泥岩层",
                "depth_range": [20, 40],
                "properties": {
                    "岩性": "泥岩、粉砂质泥岩",
                    "密度": "2.3-2.5 g/cm³",
                    "孔隙度": "10-20%",
                    "渗透率": "低",
                    "抗压强度": "20-40 MPa",
                    "弹性模量": "10-20 GPa"
                }
            },
            {
                "name": "砂岩层",
                "depth_range": [40, 60],
                "properties": {
                    "岩性": "中粗粒砂岩",
                    "密度": "2.4-2.6 g/cm³",
                    "孔隙度": "15-25%",
                    "渗透率": "中-高",
                    "抗压强度": "30-50 MPa",
                    "弹性模量": "15-25 GPa"
                }
            },
            {
                "name": "灰岩层",
                "depth_range": [60, 80],
                "properties": {
                    "岩性": "石灰岩、白云质灰岩",
                    "密度": "2.6-2.8 g/cm³",
                    "孔隙度": "5-15%",
                    "渗透率": "低-中",
                    "抗压强度": "50-80 MPa",
                    "弹性模量": "30-50 GPa"
                }
            },
            {
                "name": "变质岩层",
                "depth_range": [80, 100],
                "properties": {
                    "岩性": "片麻岩、大理岩",
                    "密度": "2.7-2.9 g/cm³",
                    "孔隙度": "1-5%",
                    "渗透率": "极低",
                    "抗压强度": "80-120 MPa",
                    "弹性模量": "50-80 GPa"
                }
            }
        ]
    }

def create_timeseries_sample_models():
    """创建示例时间序列模型 - 模拟侵蚀过程"""
    global timeseries_metadata
    
    num_phases = 5
    base_size = 100
    model_names = []
    
    for phase in range(num_phases):
        erosion_factor = phase / (num_phases - 1)
        
        mesh = create_eroded_mesh(base_size, erosion_factor)
        model_name = f"phase_{phase:02d}_erosion_{int(erosion_factor * 100):03d}"
        model_path = os.path.join(TIMESERIES_DIR, f"{model_name}.obj")
        mesh.export(model_path)
        
        model_names.append({
            'name': model_name,
            'phase': phase,
            'erosion_factor': erosion_factor,
            'label': f"阶段 {phase + 1} - 侵蚀 {int(erosion_factor * 100)}%"
        })
    
    timeseries_metadata['models'] = model_names
    timeseries_metadata['interpolation_steps'] = 10
    
    metadata_path = os.path.join(TIMESERIES_DIR, 'metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(timeseries_metadata, f, indent=2)
    
    return True

def create_eroded_mesh(base_size, erosion_factor):
    """创建具有不同侵蚀程度的网格"""
    layer_heights = [0, 20, 40, 60, 80, 100]
    
    erosion_depth = erosion_factor * 30
    erosion_width = erosion_factor * 20
    
    vertices = []
    faces = []
    vertex_offset = 0
    
    for i in range(len(layer_heights) - 1):
        z1 = layer_heights[i]
        z2 = layer_heights[i + 1]
        
        z1_eroded = z1
        z2_eroded = z2
        
        if z1 < erosion_depth:
            z1_eroded = max(0, z1 - (erosion_depth - z1) * 0.3)
        
        layer_base = [
            [0, 0, z1_eroded],
            [base_size, 0, z1_eroded],
            [base_size, base_size, z1_eroded],
            [0, base_size, z1_eroded]
        ]
        
        for v in layer_base:
            dist_from_center = np.sqrt((v[0] - base_size/2)**2 + (v[1] - base_size/2)**2)
            if dist_from_center < base_size/3:
                erosion_effect = erosion_factor * 10 * (1 - dist_from_center/(base_size/3))
                v[2] = max(0, v[2] - erosion_effect)
        
        layer_top = [
            [0 + erosion_width, 0 + erosion_width, z2_eroded],
            [base_size - erosion_width, 0 + erosion_width, z2_eroded],
            [base_size - erosion_width, base_size - erosion_width, z2_eroded],
            [0 + erosion_width, base_size - erosion_width, z2_eroded]
        ]
        
        layer_vertices = layer_base + layer_top
        
        noise = np.random.normal(0, 2 + erosion_factor * 2, (8, 3))
        noise[:, 2] *= 0.3
        layer_vertices = np.array(layer_vertices) + noise
        
        for v in layer_vertices:
            vertices.append(v.tolist())
        
        layer_faces = [
            [0, 1, 2], [0, 2, 3],
            [4, 6, 5], [4, 7, 6],
            [0, 4, 5], [0, 5, 1],
            [1, 5, 6], [1, 6, 2],
            [2, 6, 7], [2, 7, 3],
            [3, 7, 4], [3, 4, 0]
        ]
        
        for f in layer_faces:
            faces.append([f[0] + vertex_offset, f[1] + vertex_offset, f[2] + vertex_offset])
        
        vertex_offset += 8
    
    vertices = np.array(vertices)
    faces = np.array(faces)
    
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces)
    return mesh

def load_timeseries_models():
    """加载所有时间序列模型到内存"""
    global timeseries_cache, timeseries_metadata
    
    metadata_path = os.path.join(TIMESERIES_DIR, 'metadata.json')
    if os.path.exists(metadata_path):
        with open(metadata_path, 'r') as f:
            timeseries_metadata = json.load(f)
    
    for model_info in timeseries_metadata['models']:
        model_path = os.path.join(TIMESERIES_DIR, f"{model_info['name']}.obj")
        if os.path.exists(model_path):
            mesh = trimesh.load(model_path)
            timeseries_cache[model_info['name']] = {
                'mesh': mesh,
                'vertices': mesh.vertices.copy(),
                'faces': mesh.faces.copy(),
                'bounds': mesh.bounds.tolist()
            }
    
    return len(timeseries_cache)

def interpolate_vertices(v1, v2, t):
    """两个顶点数组的线性插值"""
    return v1 * (1 - t) + v2 * t

def generate_interpolated_frame(phase_index, t):
    """生成插值帧, t在[0,1]之间"""
    global timeseries_cache, timeseries_metadata
    
    models = timeseries_metadata['models']
    if phase_index >= len(models) - 1:
        phase_index = len(models) - 2
    
    model1_name = models[phase_index]['name']
    model2_name = models[phase_index + 1]['name']
    
    if model1_name not in timeseries_cache or model2_name not in timeseries_cache:
        return None
    
    v1 = timeseries_cache[model1_name]['vertices']
    v2 = timeseries_cache[model2_name]['vertices']
    
    interpolated_vertices = interpolate_vertices(v1, v2, t)
    
    return {
        'phase_index': phase_index,
        'interpolation_t': t,
        'vertices': interpolated_vertices.tolist(),
        'faces': timeseries_cache[model1_name]['faces'].tolist(),
        'bounds': [
            np.min(interpolated_vertices, axis=0).tolist(),
            np.max(interpolated_vertices, axis=0).tolist()
        ]
    }

def generate_y_sections(mesh, num_sections=20):
    """生成Y方向等距切面 - 正确对齐模型包围盒原点"""
    bounds = mesh.bounds
    x_min, y_min, z_min = bounds[0]
    x_max, y_max, z_max = bounds[1]
    
    center_x = (x_min + x_max) / 2
    center_z = (z_min + z_max) / 2
    
    sections = []
    for i in range(num_sections):
        y_pos = y_min + (y_max - y_min) * i / max(num_sections - 1, 1)
        
        plane_origin = [center_x, y_pos, center_z]
        section = mesh.section(plane_origin=plane_origin, plane_normal=[0, 1, 0])
        
        if section is not None:
            sections.append({
                'index': i,
                'y_position': y_pos,
                'normalized_y': (y_pos - y_min) / (y_max - y_min) * 100,
                'vertices': section.vertices.tolist() if hasattr(section, 'vertices') else [],
                'entities': str(section.entities) if hasattr(section, 'entities') else ''
            })
    
    return sections

def generate_section_texture(section_idx, y_pos):
    """生成切面纹理图"""
    size = 512
    img = Image.new('RGB', (size, size), color=(50, 50, 70))
    
    colors = [
        (153, 102, 51),
        (128, 77, 38),
        (102, 89, 64),
        (77, 64, 51),
        (51, 38, 26)
    ]
    
    num_layers = 5
    layer_height = size // num_layers
    
    for layer in range(num_layers):
        y1 = layer * layer_height
        y2 = (layer + 1) * layer_height
        color = colors[layer]
        
        for x in range(size):
            for y in range(y1, y2):
                noise = np.random.normal(0, 10, 3).astype(int)
                pixel_color = (
                    max(0, min(255, color[0] + noise[0])),
                    max(0, min(255, color[1] + noise[1])),
                    max(0, min(255, color[2] + noise[2]))
                )
                img.putpixel((x, y), pixel_color)
    
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    
    return img_str

@app.route('/api/model/info', methods=['GET'])
def get_model_info():
    """获取模型基本信息"""
    global model_info
    
    ensure_sample_model()
    
    if model_info is None:
        model_path = os.path.join(MODEL_DIR, 'geological_model.obj')
        mesh = trimesh.load(model_path)
        
        bounds = mesh.bounds.tolist()
        model_info = {
            'name': 'geological_model',
            'bounds': bounds,
            'center': mesh.centroid.tolist(),
            'num_vertices': len(mesh.vertices),
            'num_faces': len(mesh.faces),
            'file_size': os.path.getsize(model_path)
        }
    
    return jsonify(model_info)

@app.route('/api/model/obj', methods=['GET'])
def get_model_obj():
    """获取OBJ模型文件"""
    ensure_sample_model()
    model_path = os.path.join(MODEL_DIR, 'geological_model.obj')
    return send_file(model_path, mimetype='text/plain')

@app.route('/api/sections/y', methods=['GET'])
def get_y_sections():
    """获取Y方向切面信息和纹理"""
    global sections_cache
    
    num = int(request.args.get('num', 20))
    
    if 'y_sections' not in sections_cache:
        ensure_sample_model()
        model_path = os.path.join(MODEL_DIR, 'geological_model.obj')
        mesh = trimesh.load(model_path)
        
        sections = generate_y_sections(mesh, num)
        
        sections_with_texture = []
        for s in sections:
            texture = generate_section_texture(s['index'], s['y_position'])
            sections_with_texture.append({
                **s,
                'texture': texture
            })
        
        sections_cache['y_sections'] = sections_with_texture
    
    return jsonify({
        'sections': sections_cache['y_sections'],
        'count': len(sections_cache['y_sections'])
    })

@app.route('/api/rock-properties', methods=['GET'])
def get_rock_properties():
    """获取岩石属性 - 支持归一化 Y 坐标 (0-100)"""
    ensure_sample_model()
    props_path = os.path.join(MODEL_DIR, 'rock_properties.json')
    
    with open(props_path, 'r') as f:
        props = json.load(f)
    
    y_pos = request.args.get('y')
    if y_pos is not None:
        y_pos = float(y_pos)
        
        y_pos_clamped = max(0, min(100, y_pos))
        
        for layer in props['layers']:
            depth_range = layer['depth_range']
            if depth_range[0] <= y_pos_clamped <= depth_range[1]:
                return jsonify({
                    'current_layer': layer['name'],
                    'y_position': y_pos_clamped,
                    'properties': layer['properties']
                })
        
        if props['layers']:
            last_layer = props['layers'][-1]
            return jsonify({
                'current_layer': last_layer['name'],
                'y_position': y_pos_clamped,
                'properties': last_layer['properties']
            })
    
    return jsonify(props)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok'})

@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """清除缓存 - 用于重新加载模型"""
    global model_info, sections_cache
    model_info = None
    sections_cache = {}
    return jsonify({'status': 'success', 'message': '缓存已清除'})

# ==================== 时间序列 API ====================

@app.route('/api/timeseries/info', methods=['GET'])
def get_timeseries_info():
    """获取时间序列模型基本信息"""
    global timeseries_metadata
    
    if not timeseries_metadata['models']:
        create_timeseries_sample_models()
        load_timeseries_models()
    
    return jsonify({
        'models': timeseries_metadata['models'],
        'interpolation_steps': timeseries_metadata['interpolation_steps'],
        'total_frames': len(timeseries_metadata['models']) + 
                        (len(timeseries_metadata['models']) - 1) * timeseries_metadata['interpolation_steps']
    })

@app.route('/api/timeseries/frame/<int:frame_index>', methods=['GET'])
def get_timeseries_frame(frame_index):
    """获取指定帧的插值模型数据"""
    global timeseries_metadata
    
    if not timeseries_metadata['models']:
        create_timeseries_sample_models()
        load_timeseries_models()
    
    num_models = len(timeseries_metadata['models'])
    steps_between = timeseries_metadata['interpolation_steps']
    
    total_frames = num_models + (num_models - 1) * steps_between
    
    frame_index = max(0, min(frame_index, total_frames - 1))
    
    if frame_index % (steps_between + 1) == 0:
        model_idx = frame_index // (steps_between + 1)
        model_name = timeseries_metadata['models'][model_idx]['name']
        
        if model_name in timeseries_cache:
            return jsonify({
                'frame_index': frame_index,
                'is_keyframe': True,
                'phase_index': model_idx,
                'interpolation_t': 0,
                'vertices': timeseries_cache[model_name]['vertices'].tolist(),
                'faces': timeseries_cache[model_name]['faces'].tolist(),
                'bounds': timeseries_cache[model_name]['bounds'],
                'label': timeseries_metadata['models'][model_idx]['label']
            })
    else:
        relative_pos = frame_index % (steps_between + 1)
        phase_index = frame_index // (steps_between + 1)
        t = relative_pos / (steps_between + 1)
        
        frame_data = generate_interpolated_frame(phase_index, t)
        
        if frame_data:
            return jsonify({
                'frame_index': frame_index,
                'is_keyframe': False,
                **frame_data,
                'label': f"过渡帧 {relative_pos}/{steps_between}"
            })
    
    return jsonify({'error': 'Frame not found'}), 404

@app.route('/api/timeseries/batch', methods=['GET'])
def get_timeseries_batch():
    """批量获取多个帧的数据"""
    start_frame = int(request.args.get('start', 0))
    end_frame = int(request.args.get('end', 10))
    
    frames_data = []
    for idx in range(start_frame, end_frame + 1):
        try:
            response = get_timeseries_frame(idx)
            if response[1] == 200:
                frames_data.append(json.loads(response[0].data))
        except:
            pass
    
    return jsonify({
        'frames': frames_data,
        'count': len(frames_data)
    })

@app.route('/api/timeseries/upload', methods=['POST'])
def upload_timeseries_model():
    """上传时间序列模型文件"""
    global timeseries_metadata
    
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400
    
    files = request.files.getlist('files')
    
    if len(files) == 0:
        return jsonify({'error': 'No files selected'}), 400
    
    uploaded_models = []
    
    for idx, file in enumerate(files):
        if file.filename.endswith('.obj'):
            model_name = f"uploaded_phase_{idx:02d}"
            file_path = os.path.join(TIMESERIES_DIR, f"{model_name}.obj")
            file.save(file_path)
            
            uploaded_models.append({
                'name': model_name,
                'phase': idx,
                'erosion_factor': idx / max(len(files) - 1, 1),
                'label': f"上传模型 {idx + 1}: {file.filename}"
            })
    
    if uploaded_models:
        timeseries_metadata['models'] = uploaded_models
        timeseries_metadata['interpolation_steps'] = 10
        
        metadata_path = os.path.join(TIMESERIES_DIR, 'metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(timeseries_metadata, f, indent=2)
        
        load_timeseries_models()
        
        return jsonify({
            'status': 'success',
            'uploaded_count': len(uploaded_models),
            'models': uploaded_models
        })
    
    return jsonify({'error': 'No valid OBJ files uploaded'}), 400

@app.route('/api/timeseries/reset', methods=['POST'])
def reset_timeseries():
    """重置时间序列模型为示例数据"""
    global timeseries_cache, timeseries_metadata
    
    for file in os.listdir(TIMESERIES_DIR):
        if file.startswith('uploaded_'):
            os.remove(os.path.join(TIMESERIES_DIR, file))
    
    timeseries_cache = {}
    create_timeseries_sample_models()
    load_timeseries_models()
    
    return jsonify({'status': 'success', 'message': '已重置为示例模型'})

if __name__ == '__main__':
    create_timeseries_sample_models()
    load_timeseries_models()
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
