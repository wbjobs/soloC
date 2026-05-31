from app import create_app, db
from app.models import User, Role, DataSource, Dashboard, Chart

app = create_app()

def init_database():
    with app.app_context():
        db.create_all()
        
        if not Role.query.first():
            admin_role = Role(name='admin', description='Administrator with full access')
            editor_role = Role(name='editor', description='Can create and edit dashboards')
            viewer_role = Role(name='viewer', description='Can only view dashboards')
            db.session.add_all([admin_role, editor_role, viewer_role])
            db.session.commit()
        
        if not User.query.filter_by(username='admin').first():
            from app import bcrypt
            admin_user = User(
                username='admin',
                email='admin@example.com',
                password_hash=bcrypt.generate_password_hash('admin123').decode('utf-8'),
                role_id=Role.query.filter_by(name='admin').first().id
            )
            db.session.add(admin_user)
            db.session.commit()

if __name__ == '__main__':
    init_database()
    app.run(host='0.0.0.0', port=5000, debug=True)
