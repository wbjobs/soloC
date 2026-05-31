from sqlalchemy import create_engine, Column, Integer, Float, DateTime, text, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError
from datetime import datetime
import threading
import queue
import time

SQLALCHEMY_DATABASE_URL = "sqlite:///./modbus_data.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
    pool_recycle=300,
    echo=False
)

with engine.connect() as conn:
    conn.execute(text("PRAGMA journal_mode=WAL"))
    conn.execute(text("PRAGMA synchronous=NORMAL"))
    conn.execute(text("PRAGMA busy_timeout=5000"))
    conn.commit()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class RegisterHistory(Base):
    __tablename__ = "register_history"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, index=True)
    register_address = Column(Integer)
    value = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow)

class Rule(Base):
    __tablename__ = "rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String)
    enabled = Column(Integer, default=1)
    condition_json = Column(String)
    action_json = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class RuleLog(Base):
    __tablename__ = "rule_logs"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(Integer, index=True)
    device_id = Column(Integer, index=True)
    triggered = Column(Integer)
    message = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

class AsyncDBWriter:
    def __init__(self):
        self.queue = queue.Queue()
        self.worker_thread = threading.Thread(target=self._worker, daemon=True)
        self.worker_thread.start()
    
    def _worker(self):
        while True:
            batch = []
            try:
                while len(batch) < 50:
                    try:
                        item = self.queue.get(timeout=0.1)
                        batch.append(item)
                    except queue.Empty:
                        break
                
                if batch:
                    self._write_batch(batch)
            except Exception as e:
                print(f"DB writer error: {e}")
                time.sleep(0.1)
    
    def _write_batch(self, batch):
        max_retries = 5
        for attempt in range(max_retries):
            try:
                db = SessionLocal()
                records = []
                for item in batch:
                    record = RegisterHistory(
                        device_id=item['device_id'],
                        register_address=item['register_address'],
                        value=item['value'],
                        timestamp=item['timestamp']
                    )
                    records.append(record)
                db.bulk_save_objects(records)
                db.commit()
                db.close()
                return
            except OperationalError as e:
                if "database is locked" in str(e) and attempt < max_retries - 1:
                    time.sleep(0.1 * (attempt + 1))
                    continue
                raise
            finally:
                if 'db' in locals():
                    db.close()
    
    def write(self, device_id, register_address, value, timestamp=None):
        if timestamp is None:
            timestamp = datetime.utcnow()
        self.queue.put({
            'device_id': device_id,
            'register_address': register_address,
            'value': value,
            'timestamp': timestamp
        })

db_writer = AsyncDBWriter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def execute_with_retry(db_func, max_retries=3):
    for attempt in range(max_retries):
        try:
            return db_func()
        except OperationalError as e:
            if "database is locked" in str(e) and attempt < max_retries - 1:
                time.sleep(0.1 * (attempt + 1))
                continue
            raise
