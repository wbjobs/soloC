from app import db
from datetime import datetime

class Dashboard(db.Model):
    __tablename__ = 'dashboards'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(500))
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    is_public = db.Column(db.Boolean, default=False)
    refresh_interval = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    charts = db.relationship('Chart', backref='dashboard', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'owner_id': self.owner_id,
            'is_public': self.is_public,
            'refresh_interval': self.refresh_interval,
            'charts': [chart.to_dict() for chart in self.charts]
        }

class Chart(db.Model):
    __tablename__ = 'charts'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(20), nullable=False)
    dashboard_id = db.Column(db.Integer, db.ForeignKey('dashboards.id'), nullable=False)
    data_source_id = db.Column(db.Integer, db.ForeignKey('data_sources.id'))
    
    query_sql = db.Column(db.Text)
    options = db.Column(db.Text)
    
    x_field = db.Column(db.String(100))
    y_field = db.Column(db.String(100))
    category_field = db.Column(db.String(100))
    value_field = db.Column(db.String(100))
    
    position_x = db.Column(db.Integer, default=0)
    position_y = db.Column(db.Integer, default=0)
    width = db.Column(db.Integer, default=6)
    height = db.Column(db.Integer, default=4)
    
    refresh_interval = db.Column(db.Integer, default=0)
    last_refreshed = db.Column(db.DateTime)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        import json
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'dashboard_id': self.dashboard_id,
            'data_source_id': self.data_source_id,
            'query_sql': self.query_sql,
            'options': json.loads(self.options) if self.options else {},
            'x_field': self.x_field,
            'y_field': self.y_field,
            'category_field': self.category_field,
            'value_field': self.value_field,
            'position_x': self.position_x,
            'position_y': self.position_y,
            'width': self.width,
            'height': self.height,
            'refresh_interval': self.refresh_interval,
            'last_refreshed': self.last_refreshed.isoformat() if self.last_refreshed else None
        }
