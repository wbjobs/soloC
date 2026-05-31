from flask import Blueprint, render_template, request, jsonify, abort
from flask_login import login_required, current_user
from app import db
from app.models import AlertRule, AlertHistory, Chart, Dashboard
from app.services import AlertService
from app.blueprints.auth import role_required

alert_bp = Blueprint('alert', __name__)

@alert_bp.route('/')
@login_required
@role_required('can_edit_dashboards')
def index():
    rules = AlertRule.query.all()
    return render_template('alerts.html', rules=rules)

@alert_bp.route('/chart/<int:chart_id>')
@login_required
@role_required('can_edit_dashboards')
def list_by_chart(chart_id):
    chart = Chart.query.get_or_404(chart_id)
    dashboard = Dashboard.query.get(chart.dashboard_id)
    
    if dashboard.owner_id != current_user.id and not current_user.is_admin:
        abort(403)
    
    rules = AlertRule.query.filter_by(chart_id=chart_id).all()
    return jsonify([rule.to_dict() for rule in rules])

@alert_bp.route('/create', methods=['POST'])
@login_required
@role_required('can_edit_dashboards')
def create():
    data = request.get_json()
    
    chart = Chart.query.get_or_404(data['chart_id'])
    dashboard = Dashboard.query.get(chart.dashboard_id)
    
    if dashboard.owner_id != current_user.id and not current_user.is_admin:
        abort(403)
    
    rule = AlertRule(
        name=data['name'],
        description=data.get('description', ''),
        chart_id=data['chart_id'],
        condition_type=data['condition_type'],
        threshold=float(data['threshold']),
        compare_field=data.get('compare_field'),
        aggregate_function=data.get('aggregate_function', 'latest'),
        is_enabled=data.get('is_enabled', True),
        check_interval=data.get('check_interval', 5),
        notify_email=data.get('notify_email'),
        notify_wechat=data.get('notify_wechat'),
        cooldown_minutes=data.get('cooldown_minutes', 30),
        created_by=current_user.id
    )
    
    db.session.add(rule)
    db.session.commit()
    
    return jsonify({'success': True, 'id': rule.id, 'message': '告警规则创建成功'})

@alert_bp.route('/<int:rule_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
@role_required('can_edit_dashboards')
def manage_rule(rule_id):
    rule = AlertRule.query.get_or_404(rule_id)
    chart = Chart.query.get(rule.chart_id)
    dashboard = Dashboard.query.get(chart.dashboard_id)
    
    if dashboard.owner_id != current_user.id and not current_user.is_admin:
        abort(403)
    
    if request.method == 'GET':
        return jsonify(rule.to_dict())
    
    if request.method == 'DELETE':
        db.session.delete(rule)
        db.session.commit()
        return jsonify({'success': True, 'message': '告警规则已删除'})
    
    if request.method == 'PUT':
        data = request.get_json()
        rule.name = data.get('name', rule.name)
        rule.description = data.get('description', rule.description)
        rule.condition_type = data.get('condition_type', rule.condition_type)
        rule.threshold = float(data.get('threshold', rule.threshold))
        rule.compare_field = data.get('compare_field', rule.compare_field)
        rule.aggregate_function = data.get('aggregate_function', rule.aggregate_function)
        rule.is_enabled = data.get('is_enabled', rule.is_enabled)
        rule.check_interval = data.get('check_interval', rule.check_interval)
        rule.notify_email = data.get('notify_email', rule.notify_email)
        rule.notify_wechat = data.get('notify_wechat', rule.notify_wechat)
        rule.cooldown_minutes = data.get('cooldown_minutes', rule.cooldown_minutes)
        
        db.session.commit()
        return jsonify({'success': True, 'message': '告警规则已更新'})

@alert_bp.route('/<int:rule_id>/toggle', methods=['POST'])
@login_required
@role_required('can_edit_dashboards')
def toggle_rule(rule_id):
    rule = AlertRule.query.get_or_404(rule_id)
    chart = Chart.query.get(rule.chart_id)
    dashboard = Dashboard.query.get(chart.dashboard_id)
    
    if dashboard.owner_id != current_user.id and not current_user.is_admin:
        abort(403)
    
    rule.is_enabled = not rule.is_enabled
    db.session.commit()
    
    return jsonify({'success': True, 'is_enabled': rule.is_enabled})

@alert_bp.route('/<int:rule_id>/history')
@login_required
@role_required('can_edit_dashboards')
def get_history(rule_id):
    rule = AlertRule.query.get_or_404(rule_id)
    chart = Chart.query.get(rule.chart_id)
    dashboard = Dashboard.query.get(chart.dashboard_id)
    
    if dashboard.owner_id != current_user.id and not current_user.is_admin:
        abort(403)
    
    history = AlertHistory.query.filter_by(alert_rule_id=rule_id).order_by(AlertHistory.triggered_at.desc()).limit(50).all()
    return jsonify([h.to_dict() for h in history])

@alert_bp.route('/test/<int:rule_id>', methods=['POST'])
@login_required
@role_required('can_edit_dashboards')
def test_alert(rule_id):
    rule = AlertRule.query.get_or_404(rule_id)
    chart = Chart.query.get(rule.chart_id)
    dashboard = Dashboard.query.get(chart.dashboard_id)
    
    if dashboard.owner_id != current_user.id and not current_user.is_admin:
        abort(403)
    
    from app.models import DataSource
    from app.services import DataQueryService
    
    if not chart.data_source_id or not chart.query_sql:
        return jsonify({'success': False, 'message': '图表未配置数据源或查询'}), 400
    
    data_source = DataSource.query.get(chart.data_source_id)
    data, error = DataQueryService.execute_query(data_source, chart.query_sql)
    
    if error:
        return jsonify({'success': False, 'message': str(error)}), 400
    
    compare_value = AlertService._get_compare_value(data, rule)
    is_triggered = AlertService._evaluate_condition(compare_value, rule.condition_type, rule.threshold)
    
    return jsonify({
        'success': True,
        'data_count': len(data),
        'compare_value': compare_value,
        'threshold': rule.threshold,
        'is_triggered': is_triggered
    })
