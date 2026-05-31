from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, Float, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./ancient_books.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True)
    password_hash = Column(String(255))
    email = Column(String(255))
    role = Column(String(50), default="user")  # admin, user, guest
    is_active = Column(Boolean, default=True)
    created_time = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime)


class UploadedImage(Base):
    __tablename__ = "uploaded_images"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    filename = Column(String(255), index=True)
    original_path = Column(String(500))
    upload_time = Column(DateTime, default=datetime.utcnow)
    status = Column(String(50), default="pending")  # pending, approved, rejected
    audit_status = Column(String(50), default="pending")  # pending, approved, rejected
    audit_by = Column(Integer)
    audit_time = Column(DateTime)
    audit_comment = Column(Text)


class OCRResult(Base):
    __tablename__ = "ocr_results"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, index=True)
    text_content = Column(Text)
    confidence = Column(Float)
    bounding_boxes = Column(Text)
    created_time = Column(DateTime, default=datetime.utcnow)
    edited_text = Column(Text)
    is_verified = Column(Boolean, default=False)
    verified_by = Column(Integer)
    verified_time = Column(DateTime)


class RestorationTask(Base):
    __tablename__ = "restoration_tasks"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, index=True)
    task_type = Column(String(100))
    status = Column(String(50), default="pending")
    progress = Column(Integer, default=0)
    result_path = Column(String(500))
    created_time = Column(DateTime, default=datetime.utcnow)
    completed_time = Column(DateTime)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, index=True)
    admin_id = Column(Integer)
    action = Column(String(50))  # approve, reject, edit
    comment = Column(Text)
    created_time = Column(DateTime, default=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        import hashlib
        password_hash = hashlib.md5("admin123".encode()).hexdigest()
        default_admin = User(
            username="admin",
            password_hash=password_hash,
            email="admin@example.com",
            role="admin",
            is_active=True
        )
        db.add(default_admin)
        db.commit()
    db.close()
