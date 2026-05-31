from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_bcrypt import Bcrypt
from apscheduler.schedulers.background import BackgroundScheduler

db = SQLAlchemy()
bcrypt = Bcrypt()
login_manager = LoginManager()
login_manager.login_view = 'auth.login'
login_manager.login_message = '请先登录'

scheduler = BackgroundScheduler(daemon=True)

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'dashboard-secret-key-12345'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///dashboard.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['UPLOAD_FOLDER'] = 'uploads'
    
    db.init_app(app)
    bcrypt.init_app(app)
    login_manager.init_app(app)
    
    from app.models import User
    
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))
    
    from app.blueprints.auth import auth_bp
    from app.blueprints.dashboard import dashboard_bp
    from app.blueprints.data_source import data_source_bp
    from app.blueprints.api import api_bp
    from app.blueprints.alert import alert_bp
    from app.blueprints.share import share_bp
    
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(data_source_bp, url_prefix='/data-source')
    app.register_blueprint(api_bp, url_prefix='/api')
    app.register_blueprint(alert_bp, url_prefix='/alert')
    app.register_blueprint(share_bp)
    
    if not scheduler.running:
        scheduler.app = app
        scheduler.start()
        
        from app.services import AlertService
        scheduler.add_job(
            lambda: AlertService.check_and_trigger_alerts(app),
            'interval',
            minutes=1,
            id='alert_check_job',
            replace_existing=True
        )
    
    return app
