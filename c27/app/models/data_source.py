from app import db
from datetime import datetime

class DataSource(db.Model):
    __tablename__ = 'data_sources'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(20), nullable=False)
    description = db.Column(db.String(500))
    
    host = db.Column(db.String(255))
    port = db.Column(db.Integer)
    database = db.Column(db.String(255))
    username = db.Column(db.String(255))
    password = db.Column(db.String(255))
    
    file_path = db.Column(db.String(500))
    api_url = db.Column(db.String(500))
    api_method = db.Column(db.String(10), default='GET')
    api_headers = db.Column(db.Text)
    api_body = db.Column(db.Text)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    
    charts = db.relationship('Chart', backref='data_source', lazy=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'description': self.description,
            'host': self.host,
            'port': self.port,
            'database': self.database,
            'username': self.username,
            'file_path': self.file_path,
            'api_url': self.api_url,
            'api_method': self.api_method,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
