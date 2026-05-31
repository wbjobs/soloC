from sqlalchemy import create_engine, Column, Float, String, DateTime, Integer, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from config import settings
import json

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class OptionPricingRecord(Base):
    __tablename__ = "option_pricing_records"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    contract_symbol = Column(String, nullable=False)
    option_type = Column(String, nullable=False)
    S = Column(Float, nullable=False)
    K = Column(Float, nullable=False)
    T = Column(Float, nullable=False)
    r = Column(Float, nullable=False)
    sigma = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    delta = Column(Float, nullable=False)
    gamma = Column(Float, nullable=False)
    theta = Column(Float, nullable=False)
    vega = Column(Float, nullable=False)
    rho = Column(Float, nullable=False)
    
    __table_args__ = (
        Index('idx_contract_timestamp', 'contract_symbol', 'timestamp'),
        Index('idx_timestamp', 'timestamp'),
    )

class StockPriceRecord(Base):
    __tablename__ = "stock_price_records"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    symbol = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    volume = Column(Float, default=0.0)
    
    __table_args__ = (
        Index('idx_stock_timestamp', 'symbol', 'timestamp'),
    )

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)

def save_pricing_record(db, result):
    record = OptionPricingRecord(
        timestamp=datetime.fromtimestamp(result.timestamp),
        contract_symbol=result.inputs.contract_symbol,
        option_type=result.inputs.option_type.value,
        S=result.inputs.S,
        K=result.inputs.K,
        T=result.inputs.T,
        r=result.inputs.r,
        sigma=result.inputs.sigma,
        price=result.price,
        delta=result.greeks.delta,
        gamma=result.greeks.gamma,
        theta=result.greeks.theta,
        vega=result.greeks.vega,
        rho=result.greeks.rho
    )
    db.add(record)
    db.commit()
    return record

def save_stock_price(db, symbol: str, price: float, timestamp: float = None):
    if timestamp is None:
        timestamp = datetime.utcnow()
    else:
        timestamp = datetime.fromtimestamp(timestamp)
    
    record = StockPriceRecord(
        timestamp=timestamp,
        symbol=symbol,
        price=price
    )
    db.add(record)
    db.commit()
    return record

def get_historical_prices(db, contract_symbol: str, start_time: datetime, end_time: datetime):
    return db.query(OptionPricingRecord).filter(
        OptionPricingRecord.contract_symbol == contract_symbol,
        OptionPricingRecord.timestamp >= start_time,
        OptionPricingRecord.timestamp <= end_time
    ).order_by(OptionPricingRecord.timestamp).all()

def get_stock_prices(db, symbol: str, start_time: datetime, end_time: datetime):
    return db.query(StockPriceRecord).filter(
        StockPriceRecord.symbol == symbol,
        StockPriceRecord.timestamp >= start_time,
        StockPriceRecord.timestamp <= end_time
    ).order_by(StockPriceRecord.timestamp).all()
