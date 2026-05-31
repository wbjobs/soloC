from flask import Blueprint, render_template, request, jsonify, abort
from flask_login import login_required, current_user
from app import db, scheduler
from app.models import Dashboard, Chart, DataSource
from app.blueprints.auth import role_required
from app.services import DataQueryService
import json
from datetime import datetime

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/')
@login_required
@role_required('can_view_dashboards')
def index():
    dashboards = Dashboard.query.filter(
        (Dashboard.owner_id == current_user.id) | (Dashboard.is_public == True)
    ).all()
    return render_template('dashboards.html', dashboards=dashboards)

@dashboard_bp.route('/create', methods=['POST'])
@login_required
@role_required('can_create_dashboards')
def create():
    data = request.get_json()
    
    new_dashboard = Dashboard(
        name=data['name'],
        description=data.get('description', ''),
        owner_id=current_user.id,
        is_public=data.get('is_public', False),
        refresh_interval=data.get('refresh_interval', 0)
    )
    
    db.session.add(new_dashboard)
    db.session.commit()
    
    return jsonify({'success': True, 'id': new_dashboard.id, 'message': '看板创建成功'})

@dashboard_bp.route('/<int:dashboard_id>')
@login_required
@role_required('can_view_dashboards')
def view(dashboard_id):
    dashboard = Dashboard.query.get_or_404(dashboard_id)
    
    if not dashboard.is_public and dashboard.owner_id != current_user.id:
        if not current_user.is_admin:
            abort(403)
    
    can_edit = current_user.has_permission('can_edit_dashboards') and (
        dashboard.owner_id == current_user.id or current_user.is_admin
    )
    
    return render_template(
        'dashboard_view.html',
        dashboard=dashboard,
        can_edit=can_edit
    )

@dashboard_bp.route('/<int:dashboard_id>/edit')
@login_required
@role_required('can_edit_dashboards')
def edit(dashboard_id):
    dashboard = Dashboard.query.get_or_404(dashboard_id)
    
    if dashboard.owner_id != current_user.id and not current_user.is_admin:
        abort(403)
    
    data_sources = DataSource.query.all()
    return render_template(
        'dashboard_edit.html',
        dashboard=dashboard,
        data_sources=data_sources
    )

@dashboard_bp.route('/<int:dashboard_id>', methods=['PUT', 'DELETE'])
@login_required
def manage_dashboard(dashboard_id):
    dashboard = Dashboard.query.get_or_404(dashboard_id)
    
    if dashboard.owner_id != current_user.id and not current_user.is_admin:
        abort(403)
    
    if request.method == 'DELETE':
        if not current_user.has_permission('can_edit_dashboards'):
            abort(403)
        db.session.delete(dashboard)
        db.session.commit()
        return jsonify({'success': True, 'message': '看板已删除'})
    
    if request.method == 'PUT':
        if not current_user.has_permission('can_edit_dashboards'):
            abort(403)
        data = request.get_json()
        dashboard.name = data.get('name', dashboard.name)
        dashboard.description = data.get('description', dashboard.description)
        dashboard.is_public = data.get('is_public', dashboard.is_public)
        dashboard.refresh_interval = data.get('refresh_interval', dashboard.refresh_interval)
        db.session.commit()
        return jsonify({'success': True, 'message': '看板已更新'})

@dashboard_bp.route('/<int:dashboard_id>/charts', methods=['POST'])
@login_required
@role_required('can_edit_dashboards')
def add_chart(dashboard_id):
    dashboard = Dashboard.query.get_or_404(dashboard_id)
    
    if dashboard.owner_id != current_user.id and not current_user.is_admin:
        abort(403)
    
    data = request.get_json()
    
    new_chart = Chart(
        name=data['name'],
        type=data['type'],
        dashboard_id=dashboard_id,
        data_source_id=data.get('data_source_id'),
        query_sql=data.get('query_sql', ''),
        options=json.dumps(data.get('options', {})),
        x_field=data.get('x_field'),
        y_field=data.get('y_field'),
        category_field=data.get('category_field'),
        value_field=data.get('value_field'),
        position_x=data.get('position_x', 0),
        position_y=data.get('position_y', 0),
        width=data.get('width', 6),
        height=data.get('height', 4),
        refresh_interval=data.get('refresh_interval', 0)
    )
    
    db.session.add(new_chart)
    db.session.commit()
    
    return jsonify({'success': True, 'id': new_chart.id, 'message': '图表创建成功'})

@dashboard_bp.route('/charts/<int:chart_id>', methods=['PUT', 'DELETE'])
@login_required
@role_required('can_edit_dashboards')
def manage_chart(chart_id):
    chart = Chart.query.get_or_404(chart_id)
    
    if chart.dashboard.owner_id != current_user.id and not current_user.is_admin:
        abort(403)
    
    if request.method == 'DELETE':
        db.session.delete(chart)
        db.session.commit()
        return jsonify({'success': True, 'message': '图表已删除'})
    
    if request.method == 'PUT':
        data = request.get_json()
        chart.name = data.get('name', chart.name)
        chart.type = data.get('type', chart.type)
        chart.data_source_id = data.get('data_source_id', chart.data_source_id)
        chart.query_sql = data.get('query_sql', chart.query_sql)
        chart.options = json.dumps(data.get('options', {})) if data.get('options') else chart.options
        chart.x_field = data.get('x_field', chart.x_field)
        chart.y_field = data.get('y_field', chart.y_field)
        chart.category_field = data.get('category_field', chart.category_field)
        chart.value_field = data.get('value_field', chart.value_field)
        chart.position_x = data.get('position_x', chart.position_x)
        chart.position_y = data.get('position_y', chart.position_y)
        chart.width = data.get('width', chart.width)
        chart.height = data.get('height', chart.height)
        chart.refresh_interval = data.get('refresh_interval', chart.refresh_interval)
        
        db.session.commit()
        return jsonify({'success': True, 'message': '图表已更新'})

@dashboard_bp.route('/charts/<int:chart_id>/data')
@login_required
def get_chart_data(chart_id):
    chart = Chart.query.get_or_404(chart_id)
    dashboard = chart.dashboard
    
    if not dashboard.is_public and dashboard.owner_id != current_user.id:
        if not current_user.is_admin:
            abort(403)
    
    if not chart.data_source_id or not chart.query_sql:
        return jsonify({'success': True, 'data': []})
    
    data_source = DataSource.query.get(chart.data_source_id)
    if not data_source:
        return jsonify({'success': True, 'data': []})
    
    result, error = DataQueryService.execute_query(data_source, chart.query_sql)
    
    if error:
        return jsonify({'success': False, 'message': str(error)}), 400
    
    chart.last_refreshed = datetime.utcnow()
    db.session.commit()
    
    return jsonify({'success': True, 'data': result})

@dashboard_bp.route('/<int:dashboard_id>/save-layout', methods=['POST'])
@login_required
@role_required('can_edit_dashboards')
def save_layout(dashboard_id):
    dashboard = Dashboard.query.get_or_404(dashboard_id)
    
    if dashboard.owner_id != current_user.id and not current_user.is_admin:
        abort(403)
    
    data = request.get_json()
    
    for chart_data in data.get('charts', []):
        chart = Chart.query.get(chart_data.get('id'))
        if chart and chart.dashboard_id == dashboard_id:
            chart.position_x = chart_data.get('x', chart.position_x)
            chart.position_y = chart_data.get('y', chart.position_y)
            chart.width = chart_data.get('w', chart.width)
            chart.height = chart_data.get('h', chart.height)
    
    db.session.commit()
    return jsonify({'success': True, 'message': '布局已保存'})

@dashboard_bp.route('/<int:dashboard_id>/charts-data')
@login_required
@role_required('can_view_dashboards')
def get_all_charts_data(dashboard_id):
    dashboard = Dashboard.query.get_or_404(dashboard_id)
    
    if not dashboard.is_public and dashboard.owner_id != current_user.id:
        if not current_user.is_admin:
            abort(403)
    
    results = {}
    
    for chart in dashboard.charts:
        if not chart.data_source_id or not chart.query_sql:
            results[chart.id] = {'success': True, 'data': []}
            continue
        
        data_source = DataSource.query.get(chart.data_source_id)
        if not data_source:
            results[chart.id] = {'success': True, 'data': []}
            continue
        
        data, error = DataQueryService.execute_query(data_source, chart.query_sql)
        
        if error:
            results[chart.id] = {'success': False, 'message': str(error)}
        else:
            results[chart.id] = {'success': True, 'data': data}
            chart.last_refreshed = datetime.utcnow()
    
    db.session.commit()
    
    return jsonify({'success': True, 'charts_data': results})
