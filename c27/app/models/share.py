from app import db
from datetime import datetime
import uuid
import secrets

class ShareLink(db.Model):
    __tablename__ = 'share_links'
    
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(64), unique=True, nullable=False)
    
    dashboard_id = db.Column(db.Integer, db.ForeignKey('dashboards.id'), nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    expires_at = db.Column(db.DateTime, nullable=False)
    is_valid = db.Column(db.Boolean, default=True)
    
    password = db.Column(db.String(255))
    max_views = db.Column(db.Integer, default=0)
    current_views = db.Column(db.Integer, default=0)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    dashboard = db.relationship('Dashboard', backref='share_links', lazy=True)
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.token:
            self.token = secrets.token_urlsafe(32)
    
    @property
    def is_expired(self):
        return datetime.utcnow() > self.expires_at or not self.is_valid
    
    @property
    def is_view_limit_reached(self):
        if self.max_views <= 0:
            return False
        return self.current_views >= self.max_views
    
    def can_access(self, password=None):
        if self.is_expired:
            return False, '链接已过期或已失效'
        if self.is_view_limit_reached:
            return False, '查看次数已用完'
        if self.password and password != self.password:
            return False, '密码错误'
        return True, None
    
    def increment_views(self):
        self.current_views += 1
        db.session.commit()
    
    def to_dict(self):
        return {
            'id': self.id,
            'token': self.token,
            'dashboard_id': self.dashboard_id,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'is_valid': self.is_valid,
            'has_password': bool(self.password),
            'max_views': self.max_views,
            'current_views': self.current_views,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_expired': self.is_expired
        }
