from typing import Optional
import hashlib
import secrets


class User:
    def __init__(self, username: str, password_hash: str):
        self.username = username
        self.password_hash = password_hash


def hash_password(password: str, salt: Optional[str] = None) -> tuple:
    if salt is None:
        salt = secrets.token_hex(16)
    password_hash = hashlib.sha256(
        (password + salt).encode()
    ).hexdigest()
    return password_hash, salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    computed_hash, _ = hash_password(password, salt)
    return computed_hash == password_hash


class AuthService:
    def __init__(self):
        self.users = {}
        self.sessions = {}

    def register(self, username: str, password: str) -> bool:
        if username in self.users:
            return False
        password_hash, salt = hash_password(password)
        self.users[username] = {
            'password_hash': password_hash,
            'salt': salt
        }
        return True

    def login(self, username: str, password: str) -> Optional[str]:
        if username not in self.users:
            return None
        
        user_data = self.users[username]
        if verify_password(password, user_data['password_hash'], user_data['salt']):
            session_token = secrets.token_hex(32)
            self.sessions[session_token] = username
            return session_token
        return None

    def validate_session(self, session_token: str) -> Optional[str]:
        return self.sessions.get(session_token)

    def logout(self, session_token: str) -> bool:
        if session_token in self.sessions:
            del self.sessions[session_token]
            return True
        return False
