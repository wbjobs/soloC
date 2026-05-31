import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler


class DataFusionAnalyzer:
    def __init__(self):
        self.scaler = StandardScaler()

    def fuse_data(self, data_list: List[Dict]) -> Dict:
        if not data_list:
            return {}

        df = pd.DataFrame(data_list)

        weights = {
            'openweather_api': 0.4,
            'local_sensor': 0.35,
            'historical_db': 0.25
        }

        fused_result = {}

        for metric in ['temperature', 'humidity', 'pressure', 'wind_speed', 'precipitation']:
            values = []
            total_weight = 0

            for source, weight in weights.items():
                source_data = df[df['data_source'] == source]
                if not source_data.empty and metric in source_data.columns:
                    val = source_data[metric].dropna().mean()
                    if pd.notna(val):
                        values.append(val * weight)
                        total_weight += weight

            if values and total_weight > 0:
                fused_result[metric] = sum(values) / total_weight
            else:
                fused_result[metric] = df[metric].dropna().mean()

        return fused_result

    def compare_data_sources(self, data_list: List[Dict], metric: str = 'temperature') -> Dict:
        df = pd.DataFrame(data_list)

        comparison = {}
        for source in df['data_source'].unique():
            source_data = df[df['data_source'] == source]
            comparison[source] = {
                'mean': source_data[metric].mean(),
                'min': source_data[metric].min(),
                'max': source_data[metric].max(),
                'std': source_data[metric].std(),
                'count': len(source_data)
            }

        return comparison

    def predict_trend(self, historical_data: List[Dict], days_ahead: int = 7) -> Dict:
        df = pd.DataFrame(historical_data)
        if len(df) < 7:
            return {'error': 'Insufficient data for prediction'}

        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.sort_values('timestamp')

        df['day_num'] = (df['timestamp'] - df['timestamp'].min()).dt.days

        predictions = {}
        metrics = ['temperature', 'humidity', 'pressure', 'wind_speed']

        for metric in metrics:
            metric_df = df.dropna(subset=[metric])
            if len(metric_df) < 7:
                continue

            X = metric_df[['day_num']].values
            y = metric_df[metric].values

            model = LinearRegression()
            model.fit(X, y)

            last_day = metric_df['day_num'].max()
            future_days = np.array([[last_day + i] for i in range(1, days_ahead + 1)])
            future_values = model.predict(future_days)

            base_dates = [df['timestamp'].max() + timedelta(days=i) for i in range(1, days_ahead + 1)]
            predictions[metric] = [
                {'date': date.strftime('%Y-%m-%d'), 'value': round(float(val), 2)}
                for date, val in zip(base_dates, future_values)
            ]

        return predictions

    def detect_extreme_weather(self, data_list: List[Dict]) -> List[Dict]:
        df = pd.DataFrame(data_list)
        alerts = []

        thresholds = {
            'temperature': {'high': 35, 'low': -10},
            'wind_speed': {'high': 20},
            'precipitation': {'high': 50}
        }

        for _, row in df.iterrows():
            location_alerts = []

            if pd.notna(row.get('temperature')):
                if row['temperature'] > thresholds['temperature']['high']:
                    location_alerts.append({
                        'type': 'HIGH_TEMPERATURE',
                        'message': f"高温预警: {row['temperature']}°C",
                        'severity': 'warning'
                    })
                elif row['temperature'] < thresholds['temperature']['low']:
                    location_alerts.append({
                        'type': 'LOW_TEMPERATURE',
                        'message': f"低温预警: {row['temperature']}°C",
                        'severity': 'warning'
                    })

            if pd.notna(row.get('wind_speed')):
                if row['wind_speed'] > thresholds['wind_speed']['high']:
                    location_alerts.append({
                        'type': 'HIGH_WIND',
                        'message': f"大风预警: {row['wind_speed']} m/s",
                        'severity': 'alert'
                    })

            if pd.notna(row.get('precipitation')):
                if row['precipitation'] > thresholds['precipitation']['high']:
                    location_alerts.append({
                        'type': 'HEAVY_RAIN',
                        'message': f"暴雨预警: {row['precipitation']} mm/h",
                        'severity': 'danger'
                    })

            if location_alerts:
                alerts.append({
                    'location': row.get('location', 'Unknown'),
                    'timestamp': row.get('timestamp', datetime.now()).isoformat(),
                    'alerts': location_alerts
                })

        return alerts

    def generate_statistics(self, data_list: List[Dict]) -> Dict:
        df = pd.DataFrame(data_list)

        stats = {
            'total_records': len(df),
            'locations': df['location'].unique().tolist(),
            'data_sources': df['data_source'].unique().tolist(),
            'metrics': {}
        }

        for metric in ['temperature', 'humidity', 'pressure', 'wind_speed', 'precipitation']:
            if metric in df.columns:
                metric_data = df[metric].dropna()
                stats['metrics'][metric] = {
                    'mean': round(metric_data.mean(), 2),
                    'min': round(metric_data.min(), 2),
                    'max': round(metric_data.max(), 2),
                    'std': round(metric_data.std(), 2),
                    'count': len(metric_data)
                }

        return stats
