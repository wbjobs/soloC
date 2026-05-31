from flask import Blueprint, jsonify
from flask_login import login_required, current_user
from app.models import DataSource, Dashboard

api_bp = Blueprint('api', __name__)

@api_bp.route('/me')
@login_required
def get_current_user():
    return jsonify({
        'id': current_user.id,
        'username': current_user.username,
        'email': current_user.email,
        'role': current_user.role.name if current_user.role else None,
        'permissions': {
            'can_manage_users': current_user.has_permission('can_manage_users'),
            'can_manage_data_sources': current_user.has_permission('can_manage_data_sources'),
            'can_create_dashboards': current_user.has_permission('can_create_dashboards'),
            'can_edit_dashboards': current_user.has_permission('can_edit_dashboards'),
            'can_view_dashboards': current_user.has_permission('can_view_dashboards')
        }
    })

@api_bp.route('/stats')
@login_required
def get_stats():
    data_sources_count = DataSource.query.count()
    dashboards_count = Dashboard.query.filter(
        (Dashboard.owner_id == current_user.id) | (Dashboard.is_public == True)
    ).count()
    
    return jsonify({
        'data_sources': data_sources_count,
        'dashboards': dashboards_count,
        'is_admin': current_user.is_admin
    })
