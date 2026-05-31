from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from app import db, bcrypt
from app.models import User, Role
from datetime import datetime
from functools import wraps

auth_bp = Blueprint('auth', __name__)

def role_required(permission):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not current_user.is_authenticated:
                return redirect(url_for('auth.login'))
            if not current_user.has_permission(permission):
                flash('您没有权限执行此操作', 'danger')
                return redirect(url_for('dashboard.index'))
            return f(*args, **kwargs)
        return decorated_function
    return decorator

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard.index'))
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user = User.query.filter_by(username=username).first()
        
        if user and bcrypt.check_password_hash(user.password_hash, password):
            user.last_login = datetime.utcnow()
            db.session.commit()
            login_user(user)
            flash('登录成功', 'success')
            return redirect(url_for('dashboard.index'))
        else:
            flash('用户名或密码错误', 'danger')
    
    return render_template('login.html')

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('已退出登录', 'info')
    return redirect(url_for('auth.login'))

@auth_bp.route('/users')
@login_required
@role_required('can_manage_users')
def users():
    users = User.query.all()
    roles = Role.query.all()
    return render_template('users.html', users=users, roles=roles)

@auth_bp.route('/users/create', methods=['POST'])
@login_required
@role_required('can_manage_users')
def create_user():
    data = request.get_json()
    
    existing_user = User.query.filter(
        (User.username == data['username']) | (User.email == data['email'])
    ).first()
    
    if existing_user:
        return jsonify({'success': False, 'message': '用户名或邮箱已存在'}), 400
    
    new_user = User(
        username=data['username'],
        email=data['email'],
        password_hash=bcrypt.generate_password_hash(data['password']).decode('utf-8'),
        role_id=data['role_id']
    )
    
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({'success': True, 'message': '用户创建成功'})

@auth_bp.route('/users/<int:user_id>', methods=['PUT', 'DELETE'])
@login_required
@role_required('can_manage_users')
def manage_user(user_id):
    user = User.query.get_or_404(user_id)
    
    if request.method == 'DELETE':
        if user.id == current_user.id:
            return jsonify({'success': False, 'message': '不能删除自己的账户'}), 400
        db.session.delete(user)
        db.session.commit()
        return jsonify({'success': True, 'message': '用户已删除'})
    
    if request.method == 'PUT':
        data = request.get_json()
        user.username = data.get('username', user.username)
        user.email = data.get('email', user.email)
        user.role_id = data.get('role_id', user.role_id)
        if data.get('password'):
            user.password_hash = bcrypt.generate_password_hash(data['password']).decode('utf-8')
        db.session.commit()
        return jsonify({'success': True, 'message': '用户信息已更新'})

@auth_bp.route('/roles')
@login_required
@role_required('can_manage_users')
def roles():
    roles = Role.query.all()
    return jsonify([{
        'id': r.id,
        'name': r.name,
        'description': r.description,
        'can_manage_users': r.can_manage_users,
        'can_manage_data_sources': r.can_manage_data_sources,
        'can_create_dashboards': r.can_create_dashboards,
        'can_edit_dashboards': r.can_edit_dashboards,
        'can_view_dashboards': r.can_view_dashboards
    } for r in roles])
