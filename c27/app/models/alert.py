from app import db
from datetime import datetime

class AlertRule(db.Model):
    __tablename__ = 'alert_rules'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(500))
    chart_id = db.Column(db.Integer, db.ForeignKey('charts.id'), nullable=False)
    
    condition_type = db.Column(db.String(20), nullable=False)
    threshold = db.Column(db.Float, nullable=False)
    compare_field = db.Column(db.String(100))
    aggregate_function = db.Column(db.String(20), default='latest')
    
    is_enabled = db.Column(db.Boolean, default=True)
    check_interval = db.Column(db.Integer, default=5)
    
    notify_email = db.Column(db.Text)
    notify_wechat = db.Column(db.Text)
    
    last_triggered = db.Column(db.DateTime)
    cooldown_minutes = db.Column(db.Integer, default=30)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    
    history = db.relationship('AlertHistory', backref='alert_rule', lazy=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'chart_id': self.chart_id,
            'condition_type': self.condition_type,
            'threshold': self.threshold,
            'compare_field': self.compare_field,
            'aggregate_function': self.aggregate_function,
            'is_enabled': self.is_enabled,
            'check_interval': self.check_interval,
            'notify_email': self.notify_email,
            'notify_wechat': self.notify_wechat,
            'last_triggered': self.last_triggered.isoformat() if self.last_triggered else None,
            'cooldown_minutes': self.cooldown_minutes
        }

class AlertHistory(db.Model):
    __tablename__ = 'alert_history'
    
    id = db.Column(db.Integer, primary_key=True)
    alert_rule_id = db.Column(db.Integer, db.ForeignKey('alert_rules.id'), nullable=False)
    
    triggered_at = db.Column(db.DateTime, default=datetime.utcnow)
    trigger_value = db.Column(db.Float)
    threshold_value = db.Column(db.Float)
    condition_type = db.Column(db.String(20))
    
    message = db.Column(db.Text)
    status = db.Column(db.String(20), default='pending')
    
    sent_email = db.Column(db.Boolean, default=False)
    sent_wechat = db.Column(db.Boolean, default=False)
    error_message = db.Column(db.Text)
    
    def to_dict(self):
        return {
            'id': self.id,
            'alert_rule_id': self.alert_rule_id,
            'triggered_at': self.triggered_at.isoformat() if self.triggered_at else None,
            'trigger_value': self.trigger_value,
            'threshold_value': self.threshold_value,
            'condition_type': self.condition_type,
            'message': self.message,
            'status': self.status
        }
