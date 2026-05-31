from flask import Blueprint, render_template, request, jsonify, abort, url_for, current_app
from flask_login import login_required, current_user
from datetime import datetime, timedelta
from app import db, bcrypt
from app.models import ShareLink, Dashboard, Chart, DataSource
from app.services import DataQueryService

share_bp = Blueprint('share', __name__)

@share_bp.route('/s/<token>', methods=['GET', 'POST'])
def view_share(token):
    share = ShareLink.query.filter_by(token=token).first()
    
    if not share:
        return render_template('share_error.html', error='分享链接不存在'), 404
    
    if share.is_expired:
        return render_template('share_error.html', error='分享链接已过期'), 410
    
    if share.is_view_limit_reached:
        return render_template('share_error.html', error='分享链接查看次数已用完'), 403
    
    error = None
    if request.method == 'POST':
        password = request.form.get('password', '')
        can_access, error_msg = share.can_access(password)
        if not can_access:
            error = error_msg
    else:
        if share.password:
            return render_template('share_password.html', token=token)
    
    if not error and share.password:
        can_access, error = share.can_access(request.form.get('password', ''))
    
    if error:
        return render_template('share_password.html', token=token, error=error)
    
    share.increment_views()
    
    dashboard = Dashboard.query.get(share.dashboard_id)
    if not dashboard:
        return render_template('share_error.html', error='看板不存在'), 404
    
    return render_template('share_view.html', dashboard=dashboard, share=share)

@share_bp.route('/share/<int:dashboard_id>/charts-data')
def share_charts_data(dashboard_id):
    token = request.args.get('token')
    if not token:
        return jsonify({'success': False, 'message': '缺少token参数'}), 400
    
    share = ShareLink.query.filter_by(token=token, dashboard_id=dashboard_id).first()
    if not share or share.is_expired or share.is_view_limit_reached:
        return jsonify({'success': False, 'message': '分享链接无效或已过期'}), 403
    
    dashboard = Dashboard.query.get(dashboard_id)
    if not dashboard:
        return jsonify({'success': False, 'message': '看板不存在'}), 404
    
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
    
    return jsonify({'success': True, 'charts_data': results})

@share_bp.route('/api/share/<int:dashboard_id>', methods=['POST'])
@login_required
def create_share(dashboard_id):
    dashboard = Dashboard.query.get_or_404(dashboard_id)
    
    if dashboard.owner_id != current_user.id and not current_user.is_admin:
        abort(403)
    
    data = request.get_json()
    
    expires_minutes = data.get('expires_minutes', 1440)
    if expires_minutes <= 0:
        expires_minutes = 1440
    
    expires_at = datetime.utcnow() + timedelta(minutes=expires_minutes)
    
    password = data.get('password')
    hashed_password = None
    if password:
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    
    share = ShareLink(
        dashboard_id=dashboard_id,
        created_by=current_user.id,
        expires_at=expires_at,
        password=hashed_password,
        max_views=data.get('max_views', 0)
    )
    
    db.session.add(share)
    db.session.commit()
    
    share_url = url_for('share.view_share', token=share.token, _external=True)
    
    return jsonify({
        'success': True,
        'token': share.token,
        'share_url': share_url,
        'expires_at': expires_at.isoformat()
    })

@share_bp.route('/api/share/<int:dashboard_id>')
@login_required
def list_shares(dashboard_id):
    dashboard = Dashboard.query.get_or_404(dashboard_id)
    
    if dashboard.owner_id != current_user.id and not current_user.is_admin:
        abort(403)
    
    shares = ShareLink.query.filter_by(dashboard_id=dashboard_id).order_by(ShareLink.created_at.desc()).all()
    
    return jsonify([{
        'id': s.id,
        'token': s.token,
        'share_url': url_for('share.view_share', token=s.token, _external=True),
        'expires_at': s.expires_at.isoformat() if s.expires_at else None,
        'is_valid': s.is_valid,
        'is_expired': s.is_expired,
        'has_password': bool(s.password),
        'max_views': s.max_views,
        'current_views': s.current_views,
        'created_at': s.created_at.isoformat() if s.created_at else None
    } for s in shares])

@share_bp.route('/api/share/<int:share_id>', methods=['DELETE'])
@login_required
def revoke_share(share_id):
    share = ShareLink.query.get_or_404(share_id)
    dashboard = Dashboard.query.get(share.dashboard_id)
    
    if dashboard.owner_id != current_user.id and not current_user.is_admin:
        abort(403)
    
    share.is_valid = False
    db.session.commit()
    
    return jsonify({'success': True, 'message': '分享链接已撤销'})

@share_bp.route('/api/share/expire-options')
@login_required
def expire_options():
    return jsonify([
        {'value': 60, 'label': '1小时'},
        {'value': 360, 'label': '6小时'},
        {'value': 1440, 'label': '24小时'},
        {'value': 4320, 'label': '3天'},
        {'value': 10080, 'label': '7天'},
        {'value': 43200, 'label': '30天'}
    ])
