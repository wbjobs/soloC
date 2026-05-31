import os
from datetime import datetime
from typing import List
from sqlalchemy import create_engine, Column, DateTime, String, Float, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from collectors.base_collector import WeatherData
import pytz

load_dotenv()

Base = declarative_base()


class WeatherRecord(Base):
    __tablename__ = 'weather_records'

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, index=True)
    location = Column(String, index=True)
    latitude = Column(Float)
    longitude = Column(Float)
    temperature = Column(Float)
    humidity = Column(Float)
    pressure = Column(Float)
    wind_speed = Column(Float)
    wind_direction = Column(Float)
    precipitation = Column(Float)
    data_source = Column(String, index=True)
    quality_score = Column(Float)
    created_at = Column(DateTime, default=lambda: datetime.now(pytz.timezone('Asia/Shanghai')))


class DataStorage:
    def __init__(self):
        db_host = os.getenv('DB_HOST', 'localhost')
        db_port = os.getenv('DB_PORT', '5432')
        db_name = os.getenv('DB_NAME', 'weather_db')
        db_user = os.getenv('DB_USER', 'postgres')
        db_password = os.getenv('DB_PASSWORD', 'postgres')

        db_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
        self.engine = create_engine(db_url)
        Base.metadata.create_all(self.engine)
        Session = sessionmaker(bind=self.engine)
        self.session = Session()
        self.timezone = pytz.timezone('Asia/Shanghai')

    def normalize_timestamp(self, timestamp):
        if timestamp.tzinfo is None:
            return self.timezone.localize(timestamp)
        return timestamp.astimezone(self.timezone)

    def save_record(self, weather_data: WeatherData):
        record = WeatherRecord(
            timestamp=self.normalize_timestamp(weather_data.timestamp),
            location=weather_data.location,
            latitude=weather_data.latitude,
            longitude=weather_data.longitude,
            temperature=weather_data.temperature,
            humidity=weather_data.humidity,
            pressure=weather_data.pressure,
            wind_speed=weather_data.wind_speed,
            wind_direction=weather_data.wind_direction,
            precipitation=weather_data.precipitation,
            data_source=weather_data.data_source,
            quality_score=weather_data.quality_score
        )
        self.session.add(record)
        self.session.commit()

    def batch_save(self, weather_data_list: List[WeatherData]):
        records = []
        for data in weather_data_list:
            record = WeatherRecord(
                timestamp=self.normalize_timestamp(data.timestamp),
                location=data.location,
                latitude=data.latitude,
                longitude=data.longitude,
                temperature=data.temperature,
                humidity=data.humidity,
                pressure=data.pressure,
                wind_speed=data.wind_speed,
                wind_direction=data.wind_direction,
                precipitation=data.precipitation,
                data_source=data.data_source,
                quality_score=data.quality_score
            )
            records.append(record)

        self.session.bulk_save_objects(records)
        self.session.commit()

    def close(self):
        self.session.close()
