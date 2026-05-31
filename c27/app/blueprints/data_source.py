import os
from flask import Blueprint, render_template, request, jsonify, current_app
from flask_login import login_required, current_user
from app import db
from app.models import DataSource
from app.services import DataQueryService
from app.blueprints.auth import role_required
import uuid
from werkzeug.utils import secure_filename

data_source_bp = Blueprint('data_source', __name__)

@data_source_bp.route('/')
@login_required
@role_required('can_manage_data_sources')
def index():
    data_sources = DataSource.query.all()
    return render_template('data_sources.html', data_sources=data_sources)

@data_source_bp.route('/list')
@login_required
def list_sources():
    data_sources = DataSource.query.all()
    return jsonify([ds.to_dict() for ds in data_sources])

@data_source_bp.route('/create', methods=['POST'])
@login_required
@role_required('can_manage_data_sources')
def create():
    data = request.get_json()
    
    new_source = DataSource(
        name=data['name'],
        type=data['type'],
        description=data.get('description'),
        host=data.get('host'),
        port=data.get('port'),
        database=data.get('database'),
        username=data.get('username'),
        password=data.get('password'),
        file_path=data.get('file_path'),
        api_url=data.get('api_url'),
        api_method=data.get('api_method', 'GET'),
        api_headers=data.get('api_headers'),
        api_body=data.get('api_body'),
        created_by=current_user.id
    )
    
    db.session.add(new_source)
    db.session.commit()
    
    return jsonify({'success': True, 'message': '数据源创建成功', 'id': new_source.id})

@data_source_bp.route('/<int:source_id>')
@login_required
def get_source(source_id):
    source = DataSource.query.get_or_404(source_id)
    return jsonify(source.to_dict())

@data_source_bp.route('/<int:source_id>', methods=['PUT', 'DELETE'])
@login_required
@role_required('can_manage_data_sources')
def manage_source(source_id):
    source = DataSource.query.get_or_404(source_id)
    
    if request.method == 'DELETE':
        if source.type == 'csv' and source.file_path:
            DataQueryService.invalidate_csv_cache(source.file_path)
        db.session.delete(source)
        db.session.commit()
        return jsonify({'success': True, 'message': '数据源已删除'})
    
    if request.method == 'PUT':
        data = request.get_json()
        old_file_path = source.file_path
        source.name = data.get('name', source.name)
        source.description = data.get('description', source.description)
        source.host = data.get('host', source.host)
        source.port = data.get('port', source.port)
        source.database = data.get('database', source.database)
        source.username = data.get('username', source.username)
        if data.get('password'):
            source.password = data['password']
        
        new_file_path = data.get('file_path', source.file_path)
        if source.type == 'csv' and old_file_path and new_file_path and old_file_path != new_file_path:
            DataQueryService.invalidate_csv_cache(old_file_path)
        source.file_path = new_file_path
        
        source.api_url = data.get('api_url', source.api_url)
        source.api_method = data.get('api_method', source.api_method)
        source.api_headers = data.get('api_headers', source.api_headers)
        source.api_body = data.get('api_body', source.api_body)
        
        db.session.commit()
        return jsonify({'success': True, 'message': '数据源已更新'})

@data_source_bp.route('/<int:source_id>/test')
@login_required
def test_connection(source_id):
    source = DataSource.query.get_or_404(source_id)
    success, message = DataQueryService.test_connection(source)
    return jsonify({'success': success, 'message': message})

@data_source_bp.route('/<int:source_id>/tables')
@login_required
def get_tables(source_id):
    source = DataSource.query.get_or_404(source_id)
    tables = DataQueryService.get_tables(source)
    return jsonify({'tables': tables})

@data_source_bp.route('/<int:source_id>/columns/<table_name>')
@login_required
def get_columns(source_id, table_name):
    source = DataSource.query.get_or_404(source_id)
    columns = DataQueryService.get_columns(source, table_name)
    return jsonify({'columns': columns})

@data_source_bp.route('/<int:source_id>/query', methods=['POST'])
@login_required
def execute_query(source_id):
    source = DataSource.query.get_or_404(source_id)
    data = request.get_json()
    query = data.get('query', '')
    
    if source.type in ['mysql', 'postgresql']:
        if not query or query.strip().upper().startswith(('DELETE', 'DROP', 'UPDATE', 'INSERT', 'ALTER', 'CREATE')):
            return jsonify({'success': False, 'message': '只允许执行SELECT查询'}), 400
    
    result, error = DataQueryService.execute_query(source, query)
    
    if error:
        return jsonify({'success': False, 'message': str(error)}), 400
    
    return jsonify({'success': True, 'data': result})

@data_source_bp.route('/upload-csv', methods=['POST'])
@login_required
@role_required('can_manage_data_sources')
def upload_csv():
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': '没有文件'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': '没有选择文件'}), 400
    
    if file and file.filename.endswith('.csv'):
        upload_dir = current_app.config.get('UPLOAD_FOLDER', 'uploads')
        if not os.path.exists(upload_dir):
            os.makedirs(upload_dir)
        
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{filename}"
        file_path = os.path.join(upload_dir, unique_filename)
        file.save(file_path)
        
        return jsonify({'success': True, 'file_path': file_path})
    
    return jsonify({'success': False, 'message': '只允许CSV文件'}), 400
