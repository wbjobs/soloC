from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os
import bcrypt
import markdown
import re
from pygments import highlight
from pygments.lexers import get_lexer_by_name
from pygments.formatters import HtmlFormatter
import json
import subprocess
import tempfile
import ast

load_dotenv()

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///snippets.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'your-secret-key-here')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=7)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024

db = SQLAlchemy(app)
jwt = JWTManager(app)
CORS(app)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_sync_at = db.Column(db.DateTime, default=datetime.utcnow)
    device_id = db.Column(db.String(100))

    def set_password(self, password):
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def check_password(self, password):
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))

class Snippet(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    language = db.Column(db.String(50), nullable=False)
    code = db.Column(db.Text, nullable=False)
    description = db.Column(db.Text)
    tags = db.Column(db.String(500))
    is_public = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sync_version = db.Column(db.Integer, default=1)
    is_deleted = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'language': self.language,
            'code': self.code,
            'description': self.description,
            'tags': self.tags.split(',') if self.tags else [],
            'is_public': self.is_public,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'sync_version': self.sync_version
        }

class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'))

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class TeamMember(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    role = db.Column(db.String(20), default='member')
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)

class TeamInvite(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=False)
    invited_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    invited_email = db.Column(db.String(120), nullable=False)
    status = db.Column(db.String(20), default='pending')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class SharedSnippet(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    snippet_id = db.Column(db.Integer, db.ForeignKey('snippet.id'), nullable=False)
    team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=False)
    shared_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    shared_at = db.Column(db.DateTime, default=datetime.utcnow)
    can_edit = db.Column(db.Boolean, default=False)

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already exists'}), 400
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already exists'}), 400
    
    user = User(username=data['username'], email=data['email'])
    user.set_password(data['password'])
    db.session.add(user)
    db.session.commit()
    
    access_token = create_access_token(identity=user.id)
    return jsonify({'access_token': access_token, 'user': {'id': user.id, 'username': user.username, 'email': user.email}}), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(username=data['username']).first()
    if not user or not user.check_password(data['password']):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    user.last_sync_at = datetime.utcnow()
    db.session.commit()
    
    access_token = create_access_token(identity=user.id)
    return jsonify({'access_token': access_token, 'user': {'id': user.id, 'username': user.username, 'email': user.email}})

def escape_sql_like(pattern):
    return pattern.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')

@app.route('/api/snippets', methods=['GET'])
@jwt_required()
def get_snippets():
    user_id = get_jwt_identity()
    language = request.args.get('language')
    tag = request.args.get('tag')
    search = request.args.get('search')
    
    query = Snippet.query.filter_by(user_id=user_id, is_deleted=False)
    
    if language:
        query = query.filter_by(language=language)
    if tag:
        escaped_tag = escape_sql_like(tag)
        query = query.filter(Snippet.tags.like(f'%{escaped_tag}%', escape='\\'))
    if search:
        escaped_search = escape_sql_like(search)
        query = query.filter(
            (Snippet.title.like(f'%{escaped_search}%', escape='\\')) | 
            (Snippet.code.like(f'%{escaped_search}%', escape='\\')) |
            (Snippet.description.like(f'%{escaped_search}%', escape='\\'))
        )
    
    snippets = query.order_by(Snippet.updated_at.desc()).all()
    return jsonify([s.to_dict() for s in snippets])

@app.route('/api/snippets', methods=['POST'])
@jwt_required()
def create_snippet():
    user_id = get_jwt_identity()
    data = request.get_json(force=True)
    
    snippet = Snippet(
        user_id=user_id,
        title=data['title'],
        language=data['language'],
        code=data['code'],
        description=data.get('description', ''),
        tags=','.join(data.get('tags', [])),
        is_public=data.get('is_public', False)
    )
    db.session.add(snippet)
    db.session.commit()
    
    return jsonify(snippet.to_dict()), 201

@app.route('/api/snippets/<int:snippet_id>', methods=['PUT'])
@jwt_required()
def update_snippet(snippet_id):
    user_id = get_jwt_identity()
    snippet = Snippet.query.filter_by(id=snippet_id, user_id=user_id).first()
    if not snippet:
        return jsonify({'error': 'Snippet not found'}), 404
    
    data = request.get_json()
    snippet.title = data.get('title', snippet.title)
    snippet.language = data.get('language', snippet.language)
    snippet.code = data.get('code', snippet.code)
    snippet.description = data.get('description', snippet.description)
    snippet.tags = ','.join(data.get('tags', []))
    snippet.is_public = data.get('is_public', snippet.is_public)
    snippet.sync_version += 1
    
    db.session.commit()
    return jsonify(snippet.to_dict())

@app.route('/api/snippets/<int:snippet_id>', methods=['DELETE'])
@jwt_required()
def delete_snippet(snippet_id):
    user_id = get_jwt_identity()
    snippet = Snippet.query.filter_by(id=snippet_id, user_id=user_id).first()
    if not snippet:
        return jsonify({'error': 'Snippet not found'}), 404
    
    snippet.is_deleted = True
    snippet.sync_version += 1
    db.session.commit()
    return jsonify({'message': 'Snippet deleted'})

@app.route('/api/snippets/<int:snippet_id>/preview', methods=['GET'])
@jwt_required()
def preview_snippet(snippet_id):
    user_id = get_jwt_identity()
    snippet = Snippet.query.filter_by(id=snippet_id, user_id=user_id).first()
    if not snippet:
        return jsonify({'error': 'Snippet not found'}), 404
    
    try:
        lexer = get_lexer_by_name(snippet.language, stripall=True)
        formatter = HtmlFormatter(style='monokai', full=True)
        highlighted_code = highlight(snippet.code, lexer, formatter)
    except:
        highlighted_code = f'<pre>{snippet.code}</pre>'
    
    description_html = markdown.markdown(snippet.description or '')
    
    return jsonify({
        'highlighted_code': highlighted_code,
        'description_html': description_html,
        'snippet': snippet.to_dict()
    })

@app.route('/api/sync', methods=['POST'])
@jwt_required()
def sync_snippets():
    user_id = get_jwt_identity()
    
    try:
        data = request.get_json(force=True)
    except:
        return jsonify({'error': 'Invalid JSON payload'}), 400
        
    client_snippets = data.get('snippets', [])
    last_sync = data.get('last_sync')
    device_id = data.get('device_id')
    
    user = User.query.get(user_id)
    user.last_sync_at = datetime.utcnow()
    user.device_id = device_id
    
    server_changes = []
    if last_sync:
        try:
            last_sync_dt = datetime.fromisoformat(last_sync)
            server_changes = Snippet.query.filter(
                Snippet.user_id == user_id,
                Snippet.updated_at > last_sync_dt
            ).all()
        except ValueError:
            server_changes = Snippet.query.filter_by(user_id=user_id).all()
    else:
        server_changes = Snippet.query.filter_by(user_id=user_id).all()
    
    batch_size = 50
    for i in range(0, len(client_snippets), batch_size):
        batch = client_snippets[i:i+batch_size]
        
        for client_snippet in batch:
            snippet_id = client_snippet.get('id')
            if snippet_id and snippet_id > 0:
                existing = Snippet.query.filter_by(id=snippet_id, user_id=user_id).first()
                if existing and client_snippet.get('sync_version', 0) > existing.sync_version:
                    existing.title = client_snippet['title']
                    existing.language = client_snippet['language']
                    existing.code = client_snippet['code']
                    existing.description = client_snippet.get('description', '')
                    existing.tags = ','.join(client_snippet.get('tags', []))
                    existing.is_deleted = client_snippet.get('is_deleted', False)
                    existing.sync_version = client_snippet['sync_version']
                    existing.updated_at = datetime.utcnow()
            else:
                new_snippet = Snippet(
                    user_id=user_id,
                    title=client_snippet['title'],
                    language=client_snippet['language'],
                    code=client_snippet['code'],
                    description=client_snippet.get('description', ''),
                    tags=','.join(client_snippet.get('tags', [])),
                    is_public=client_snippet.get('is_public', False),
                    sync_version=client_snippet.get('sync_version', 1)
                )
                db.session.add(new_snippet)
                db.session.flush()
                server_changes.append(new_snippet)
        
        db.session.flush()
    
    db.session.commit()
    
    return jsonify({
        'server_snippets': [s.to_dict() for s in server_changes],
        'current_sync_time': datetime.utcnow().isoformat()
    })

@app.route('/api/export', methods=['GET'])
@jwt_required()
def export_snippets():
    user_id = get_jwt_identity()
    snippets = Snippet.query.filter_by(user_id=user_id, is_deleted=False).all()
    
    export_data = {
        'version': '1.0',
        'exported_at': datetime.utcnow().isoformat(),
        'snippets': [s.to_dict() for s in snippets]
    }
    
    return jsonify(export_data)

@app.route('/api/import', methods=['POST'])
@jwt_required()
def import_snippets():
    user_id = get_jwt_identity()
    data = request.get_json()
    imported = 0
    
    for snippet_data in data.get('snippets', []):
        snippet = Snippet(
            user_id=user_id,
            title=snippet_data['title'],
            language=snippet_data['language'],
            code=snippet_data['code'],
            description=snippet_data.get('description', ''),
            tags=','.join(snippet_data.get('tags', [])),
            is_public=snippet_data.get('is_public', False)
        )
        db.session.add(snippet)
        imported += 1
    
    db.session.commit()
    return jsonify({'message': f'Imported {imported} snippets', 'count': imported})

@app.route('/api/teams', methods=['POST'])
@jwt_required()
def create_team():
    user_id = get_jwt_identity()
    data = request.get_json()
    
    team = Team(
        name=data['name'],
        description=data.get('description', ''),
        created_by=user_id
    )
    db.session.add(team)
    db.session.flush()
    
    member = TeamMember(team_id=team.id, user_id=user_id, role='admin')
    db.session.add(member)
    db.session.commit()
    
    return jsonify({'id': team.id, 'name': team.name}), 201

@app.route('/api/teams', methods=['GET'])
@jwt_required()
def list_teams():
    user_id = get_jwt_identity()
    memberships = TeamMember.query.filter_by(user_id=user_id).all()
    team_ids = [m.team_id for m in memberships]
    teams = Team.query.filter(Team.id.in_(team_ids)).all()
    return jsonify([t.to_dict() for t in teams])

@app.route('/api/teams/<int:team_id>/invite', methods=['POST'])
@jwt_required()
def invite_to_team(team_id):
    user_id = get_jwt_identity()
    data = request.get_json()
    email = data['email']
    
    member = TeamMember.query.filter_by(team_id=team_id, user_id=user_id, role='admin').first()
    if not member:
        return jsonify({'error': 'Not authorized to invite'}), 403
    
    invited_user = User.query.filter_by(email=email).first()
    if invited_user:
        existing = TeamMember.query.filter_by(team_id=team_id, user_id=invited_user.id).first()
        if existing:
            return jsonify({'error': 'User already in team'}), 400
    
    invite = TeamInvite(
        team_id=team_id,
        invited_by=user_id,
        invited_email=email
    )
    db.session.add(invite)
    db.session.commit()
    
    return jsonify({'message': 'Invitation sent', 'invite_id': invite.id})

@app.route('/api/invites', methods=['GET'])
@jwt_required()
def list_invites():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    invites = TeamInvite.query.filter_by(invited_email=user.email, status='pending').all()
    
    result = []
    for invite in invites:
        team = Team.query.get(invite.team_id)
        result.append({
            'id': invite.id,
            'team_id': team.id,
            'team_name': team.name,
            'invited_at': invite.created_at.isoformat()
        })
    return jsonify(result)

@app.route('/api/invites/<int:invite_id>/accept', methods=['POST'])
@jwt_required()
def accept_invite(invite_id):
    user_id = get_jwt_identity()
    invite = TeamInvite.query.get(invite_id)
    
    if not invite or invite.status != 'pending':
        return jsonify({'error': 'Invalid or expired invite'}), 404
    
    user = User.query.get(user_id)
    if user.email != invite.invited_email:
        return jsonify({'error': 'Not authorized'}), 403
    
    member = TeamMember(team_id=invite.team_id, user_id=user_id, role='member')
    db.session.add(member)
    invite.status = 'accepted'
    db.session.commit()
    
    return jsonify({'message': 'Joined team successfully'})

@app.route('/api/teams/<int:team_id>/share', methods=['POST'])
@jwt_required()
def share_snippet(team_id):
    user_id = get_jwt_identity()
    data = request.get_json()
    snippet_id = data['snippet_id']
    can_edit = data.get('can_edit', False)
    
    member = TeamMember.query.filter_by(team_id=team_id, user_id=user_id).first()
    if not member:
        return jsonify({'error': 'Not a team member'}), 403
    
    snippet = Snippet.query.get(snippet_id)
    if not snippet or snippet.user_id != user_id:
        return jsonify({'error': 'Snippet not found or not owned'}), 404
    
    existing = SharedSnippet.query.filter_by(snippet_id=snippet_id, team_id=team_id).first()
    if existing:
        return jsonify({'error': 'Snippet already shared'}), 400
    
    shared = SharedSnippet(
        snippet_id=snippet_id,
        team_id=team_id,
        shared_by=user_id,
        can_edit=can_edit
    )
    db.session.add(shared)
    db.session.commit()
    
    return jsonify({'message': 'Snippet shared with team'})

@app.route('/api/teams/<int:team_id>/snippets', methods=['GET'])
@jwt_required()
def get_shared_snippets(team_id):
    user_id = get_jwt_identity()
    
    member = TeamMember.query.filter_by(team_id=team_id, user_id=user_id).first()
    if not member:
        return jsonify({'error': 'Not a team member'}), 403
    
    shared = SharedSnippet.query.filter_by(team_id=team_id).all()
    snippet_ids = [s.snippet_id for s in shared]
    snippets = Snippet.query.filter(Snippet.id.in_(snippet_ids)).all()
    
    result = []
    for s in snippets:
        shared_info = SharedSnippet.query.filter_by(snippet_id=s.id, team_id=team_id).first()
        snippet_dict = s.to_dict()
        snippet_dict['shared_by'] = shared_info.shared_by
        snippet_dict['can_edit'] = shared_info.can_edit
        result.append(snippet_dict)
    
    return jsonify(result)

@app.route('/api/teams/<int:team_id>/snippets/<int:snippet_id>', methods=['PUT'])
@jwt_required()
def edit_shared_snippet(team_id, snippet_id):
    user_id = get_jwt_identity()
    data = request.get_json()
    
    member = TeamMember.query.filter_by(team_id=team_id, user_id=user_id).first()
    if not member:
        return jsonify({'error': 'Not a team member'}), 403
    
    shared = SharedSnippet.query.filter_by(team_id=team_id, snippet_id=snippet_id).first()
    if not shared:
        return jsonify({'error': 'Snippet not shared with team'}), 404
    
    snippet = Snippet.query.get(snippet_id)
    if snippet.user_id != user_id and not shared.can_edit:
        return jsonify({'error': 'Not authorized to edit this snippet'}), 403
    
    if 'title' in data:
        snippet.title = data['title']
    if 'code' in data:
        snippet.code = data['code']
    if 'description' in data:
        snippet.description = data['description']
    if 'tags' in data:
        snippet.tags = ','.join(data['tags'])
    
    db.session.commit()
    return jsonify(snippet.to_dict())

@app.route('/api/teams/<int:team_id>/members', methods=['GET'])
@jwt_required()
def get_team_members(team_id):
    user_id = get_jwt_identity()
    
    member = TeamMember.query.filter_by(team_id=team_id, user_id=user_id).first()
    if not member:
        return jsonify({'error': 'Not a team member'}), 403
    
    members = TeamMember.query.filter_by(team_id=team_id).all()
    result = []
    for m in members:
        user = User.query.get(m.user_id)
        result.append({
            'id': m.id,
            'user_id': m.user_id,
            'username': user.username,
            'email': user.email,
            'role': m.role,
            'joined_at': m.joined_at.isoformat() if m.joined_at else None
        })
    
    return jsonify(result)

def check_python_syntax(code):
    errors = []
    try:
        ast.parse(code)
    except SyntaxError as e:
        errors.append({
            'line': e.lineno,
            'column': e.offset,
            'message': e.msg,
            'severity': 'error'
        })
    except Exception as e:
        errors.append({
            'line': 0,
            'column': 0,
            'message': str(e),
            'severity': 'error'
        })
    return errors

def check_go_syntax(code):
    errors = []
    with tempfile.NamedTemporaryFile(mode='w', suffix='.go', delete=False) as f:
        f.write(code)
        temp_path = f.name
    
    try:
        result = subprocess.run(
            ['go', 'fmt', temp_path],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode != 0:
            lines = result.stderr.split('\n')
            for line in lines:
                if ':' in line and '.go:' in line:
                    parts = line.split(':')
                    if len(parts) >= 3:
                        try:
                            line_num = int(parts[1].strip())
                            errors.append({
                                'line': line_num,
                                'column': 0,
                                'message': parts[2].strip(),
                                'severity': 'error'
                            })
                        except:
                            pass
    except Exception as e:
        errors.append({
            'line': 0,
            'column': 0,
            'message': f'Go syntax check failed: {str(e)}',
            'severity': 'warning'
        })
    finally:
        os.unlink(temp_path)
    
    return errors

def check_java_syntax(code):
    errors = []
    with tempfile.NamedTemporaryFile(mode='w', suffix='.java', delete=False) as f:
        f.write(code)
        temp_path = f.name
    
    try:
        result = subprocess.run(
            ['javac', '-d', tempfile.gettempdir(), temp_path],
            capture_output=True,
            text=True,
            timeout=15
        )
        if result.returncode != 0:
            lines = result.stderr.split('\n')
            for line in lines:
                if ':' in line and '.java:' in line:
                    parts = line.split(':')
                    if len(parts) >= 3:
                        try:
                            line_num = int(parts[1].strip())
                            errors.append({
                                'line': line_num,
                                'column': 0,
                                'message': parts[2].strip(),
                                'severity': 'error'
                            })
                        except:
                            pass
    except Exception as e:
        errors.append({
            'line': 0,
            'column': 0,
            'message': f'Java syntax check failed: {str(e)}',
            'severity': 'warning'
        })
    finally:
        os.unlink(temp_path)
        class_path = temp_path.replace('.java', '.class')
        if os.path.exists(class_path):
            os.unlink(class_path)
    
    return errors

@app.route('/api/lint', methods=['POST'])
@jwt_required()
def lint_snippet():
    data = request.get_json(force=True)
    language = data.get('language', '').lower()
    code = data.get('code', '')
    
    if not code:
        return jsonify({'error': 'Code is required'}), 400
    
    errors = []
    if language == 'python':
        errors = check_python_syntax(code)
    elif language == 'go':
        errors = check_go_syntax(code)
    elif language == 'java':
        errors = check_java_syntax(code)
    else:
        return jsonify({'error': f'Unsupported language: {language}'}), 400
    
    return jsonify({
        'valid': len(errors) == 0,
        'errors': errors,
        'language': language
    })

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5000)
