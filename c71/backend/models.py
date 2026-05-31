from sqlalchemy import Column, Integer, String, DateTime, LargeBinary
from sqlalchemy.sql import func
from database import Base

class Composition(Base):
    __tablename__ = "compositions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    style = Column(String)
    melody_data = Column(LargeBinary)
    accompaniment_data = Column(LargeBinary)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
