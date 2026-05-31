import os
import json
import pandas as pd
import subprocess
import uuid
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'data'
app.config['RESULTS_FOLDER'] = 'results'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

ALLOWED_EXTENSIONS = {'csv', 'txt'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_files():
    if 'expression_file' not in request.files or 'group_file' not in request.files:
        return jsonify({'error': '缺少文件'}), 400
    
    expr_file = request.files['expression_file']
    group_file = request.files['group_file']
    mode = request.form.get('mode', 'pairwise')
    
    if expr_file.filename == '' or group_file.filename == '':
        return jsonify({'error': '未选择文件'}), 400
    
    if expr_file and allowed_file(expr_file.filename) and group_file and allowed_file(group_file.filename):
        job_id = str(uuid.uuid4())[:8]
        job_folder = os.path.join(app.config['RESULTS_FOLDER'], job_id)
        os.makedirs(job_folder, exist_ok=True)
        
        expr_filename = secure_filename(expr_file.filename)
        group_filename = secure_filename(group_file.filename)
        
        expr_path = os.path.join(job_folder, expr_filename)
        group_path = os.path.join(job_folder, group_filename)
        
        expr_file.save(expr_path)
        group_file.save(group_path)
        
        result = run_analysis(expr_path, group_path, job_folder, mode)
        result['job_id'] = job_id
        
        return jsonify(result)
    
    return jsonify({'error': '文件格式不支持'}), 400

def run_analysis(expr_path, group_path, output_folder, mode='pairwise'):
    r_script = os.path.join('scripts', 'deseq2_analysis.R')
    
    cmd = [
        'Rscript', r_script,
        '--expression', expr_path,
        '--groups', group_path,
        '--output', output_folder,
        '--mode', mode
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
        json_file = os.path.join(output_folder, 'analysis_results.json')
        
        if os.path.exists(json_file):
            with open(json_file, 'r', encoding='utf-8') as f:
                analysis_data = json.load(f)
            
            comparisons = []
            for comp_name, comp_info in analysis_data['summary'].items():
                csv_file = os.path.join(output_folder, comp_info['csv_file'])
                df = pd.read_csv(csv_file, quotechar='"', encoding='utf-8')
                df = df.sort_values('gene').reset_index(drop=True)
                df['significant'] = (abs(df['log2FoldChange']) > 1) & (df['padj'] < 0.05)
                
                significant_genes = df[df['significant']].to_dict('records')
                
                comparisons.append({
                    'name': comp_name,
                    'group1': comp_info['group1'],
                    'group2': comp_info['group2'],
                    'method': comp_info['method'],
                    'total_genes': comp_info['total_genes'],
                    'significant_count': comp_info['significant_count'],
                    'significant_genes': significant_genes,
                    'all_genes': df.to_dict('records'),
                    'gene_set': analysis_data['gene_sets'][comp_name]
                })
            
            is_multi_group = len(comparisons) > 1
            
            response = {
                'success': True,
                'is_multi_group': is_multi_group,
                'comparisons': comparisons,
                'gene_sets': analysis_data['gene_sets']
            }
            
            return response
        else:
            return {'success': False, 'error': '分析失败，未生成结果文件'}
    except subprocess.CalledProcessError as e:
        return {'success': False, 'error': f'R 脚本执行失败: {e.stderr}'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

@app.route('/kegg/<gene_name>')
def get_kegg_pathways(gene_name):
    kegg_data = load_kegg_database()
    pathways = kegg_data.get(gene_name, [])
    return jsonify({'gene': gene_name, 'pathways': pathways})

def load_kegg_database():
    kegg_file = os.path.join('data', 'kegg_pathways.json')
    if os.path.exists(kegg_file):
        with open(kegg_file, 'r') as f:
            return json.load(f)
    return {}

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(app.config['RESULTS_FOLDER'], exist_ok=True)
    os.makedirs('static', exist_ok=True)
    app.run(debug=True, host='0.0.0.0', port=5000)
