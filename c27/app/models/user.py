from app import db
from flask_login import UserMixin
from datetime import datetime

class Role(db.Model):
    __tablename__ = 'roles'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.String(200))
    can_manage_users = db.Column(db.Boolean, default=False)
    can_manage_data_sources = db.Column(db.Boolean, default=False)
    can_create_dashboards = db.Column(db.Boolean, default=False)
    can_edit_dashboards = db.Column(db.Boolean, default=False)
    can_view_dashboards = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    users = db.relationship('User', backref='role', lazy=True)
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.name == 'admin':
            self.can_manage_users = True
            self.can_manage_data_sources = True
            self.can_create_dashboards = True
            self.can_edit_dashboards = True
        elif self.name == 'editor':
            self.can_manage_data_sources = True
            self.can_create_dashboards = True
            self.can_edit_dashboards = True
        elif self.name == 'viewer':
            self.can_view_dashboards = True

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    
    dashboards = db.relationship('Dashboard', backref='owner', lazy=True)
    
    def has_permission(self, permission):
        if not self.role:
            return False
        return getattr(self.role, permission, False)
    
    @property
    def is_admin(self):
        return self.role.name == 'admin' if self.role else False
