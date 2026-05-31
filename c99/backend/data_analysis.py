import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.preprocessing import StandardScaler, PolynomialFeatures
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error
import warnings
warnings.filterwarnings('ignore')


class WeatherPredictionModel:
    def __init__(self):
        self.model = None
        self.scaler = StandardScaler()
        self.poly_features = None
        self.metrics_history = {}

    def train(self, X, y, model_type='linear'):
        if model_type == 'ridge':
            self.model = Ridge(alpha=1.0)
        elif model_type == 'polynomial':
            self.poly_features = PolynomialFeatures(degree=2)
            X_poly = self.poly_features.fit_transform(X)
            self.model = LinearRegression()
            self.model.fit(X_poly, y)
            return self.model
        else:
            self.model = LinearRegression()
        
        self.model.fit(X, y)
        return self.model

    def predict(self, X):
        if self.poly_features:
            X_poly = self.poly_features.transform(X)
            return self.model.predict(X_poly)
        return self.model.predict(X)

    def calculate_confidence_interval(self, X, y_pred, confidence=0.95):
        n = len(X)
        residual = y_pred - self.predict(X) if hasattr(self.model, 'predict') else np.zeros_like(y_pred)
        mse = np.mean(residual ** 2)
        std_error = np.sqrt(mse * (1 + 1/n))
        z_score = 1.96 if confidence == 0.95 else 1.645
        margin = z_score * std_error
        return y_pred - margin, y_pred + margin

    def evaluate_model(self, X, y):
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        self.train(X_train, y_train)
        y_pred = self.predict(X_test)
        
        return {
            'r2_score': round(r2_score(y_test, y_pred), 4),
            'rmse': round(np.sqrt(mean_squared_error(y_test, y_pred)), 4),
            'mae': round(mean_absolute_error(y_test, y_pred), 4),
            'mape': round(np.mean(np.abs((y_test - y_pred) / (y_test + 1e-8)) * 100, 2) if len(y_test) > 0 else 0
        }


class DataFusionAnalyzer:
    def __init__(self):
        self.scaler = StandardScaler()
        self.prediction_models = {}

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
                'mean': float(source_data[metric].mean()) if pd.notna(source_data[metric].mean()) else None,
                'min': float(source_data[metric].min()) if pd.notna(source_data[metric].min()) else None,
                'max': float(source_data[metric].max()) if pd.notna(source_data[metric].max()) else None,
                'std': float(source_data[metric].std()) if pd.notna(source_data[metric].std()) else None,
                'count': int(len(source_data))
            }

        return comparison

    def _add_seasonal_features(self, df: pd.DataFrame) -> pd.DataFrame:
        df['hour'] = df['timestamp'].dt.hour
        df['day_of_week'] = df['timestamp'].dt.dayofweek
        df['day_of_year'] = df['timestamp'].dt.dayofyear
        df['month'] = df['timestamp'].dt.month
        
        df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
        df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
        df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
        df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
        
        return df

    def predict_trend(self, historical_data: List[Dict], days_ahead: int = 7) -> Dict:
        df = pd.DataFrame(historical_data)
        if len(df) < 14:
            return {'error': f'Insufficient data for prediction. Need at least 14 records, got {len(df)}'}

        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.sort_values('timestamp')
        df = self._add_seasonal_features(df)
        df['day_num'] = (df['timestamp'] - df['timestamp'].min()).dt.days

        predictions = {}
        model_evaluation = {}
        metrics = ['temperature', 'humidity', 'pressure', 'wind_speed', 'precipitation']

        for metric in metrics:
            metric_df = df.dropna(subset=[metric])
            if len(metric_df) < 14:
                continue

            feature_cols = ['day_num', 'hour_sin', 'hour_cos', 'month_sin', 'month_cos']
            X = metric_df[feature_cols].values
            y = metric_df[metric].values

            model = WeatherPredictionModel()
            evaluation = model.evaluate_model(X, y)
            model_evaluation[metric] = evaluation

            model.train(X, y)
            last_day = metric_df['day_num'].max()
            last_timestamp = df['timestamp'].max()
            
            future_data = []
            for i in range(1, days_ahead + 1):
                future_day = last_day + i
                future_timestamp = last_timestamp + timedelta(days=i)
                
                future_features = {
                    'day_num': future_day,
                    'hour': 12,
                    'month': future_timestamp.month
                }
                
                hour_sin = np.sin(2 * np.pi * future_features['hour'] / 24)
                hour_cos = np.cos(2 * np.pi * future_features['hour'] / 24)
                month_sin = np.sin(2 * np.pi * future_features['month'] / 12)
                month_cos = np.cos(2 * np.pi * future_features['month'] / 12)
                
                X_future = np.array([[future_day, hour_sin, hour_cos, month_sin, month_cos]])
                predicted_value = model.predict(X_future)[0]
                
                future_data.append({
                    'date': future_timestamp.strftime('%Y-%m-%d'),
                    'value': round(float(predicted_value), 2),
                    'timestamp': future_timestamp.isoformat()
                })

            predictions[metric] = future_data

        trend_analysis = self._analyze_trend(df)

        return {
            'predictions': predictions,
            'model_evaluation': model_evaluation,
            'trend_analysis': trend_analysis,
            'prediction_days': days_ahead,
            'historical_days': len(df['timestamp'].dt.date.unique())
        }

    def _analyze_trend(self, df: pd.DataFrame) -> Dict:
        analysis = {}
        metrics = ['temperature', 'humidity', 'pressure', 'wind_speed']

        for metric in metrics:
            metric_df = df.dropna(subset=[metric])
            if len(metric_df) < 7:
                continue

            X = metric_df[['day_num']].values
            y = metric_df[metric].values

            model = LinearRegression()
            model.fit(X, y)

            slope = model.coef_[0]
            trend = 'rising' if slope > 0.1 else 'falling' if slope < -0.1 else 'stable'

            analysis[metric] = {
                'trend': trend,
                'slope': round(float(slope), 4),
                'intercept': round(float(model.intercept_), 2),
                'direction': 'up' if slope > 0 else 'down' if slope < 0 else 'flat'
            }

        return analysis

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
                    'timestamp': row.get('timestamp', datetime.now()).isoformat() if hasattr(row.get('timestamp'), 'isoformat') else str(row.get('timestamp')),
                    'alerts': location_alerts
                })

        return alerts

    def generate_statistics(self, data_list: List[Dict]) -> Dict:
        df = pd.DataFrame(data_list)

        stats = {
            'total_records': int(len(df)),
            'locations': df['location'].unique().tolist(),
            'data_sources': df['data_source'].unique().tolist(),
            'date_range': {
                'start': df['timestamp'].min().isoformat() if 'timestamp' in df.columns else None,
                'end': df['timestamp'].max().isoformat() if 'timestamp' in df.columns else None
            },
            'metrics': {}
        }

        for metric in ['temperature', 'humidity', 'pressure', 'wind_speed', 'precipitation']:
            if metric in df.columns:
                metric_data = df[metric].dropna()
                if len(metric_data) > 0:
                    stats['metrics'][metric] = {
                        'mean': round(float(metric_data.mean()), 2),
                        'min': round(float(metric_data.min()), 2),
                        'max': round(float(metric_data.max()), 2),
                        'std': round(float(metric_data.std()), 2),
                        'count': int(len(metric_data))
                    }

        return stats

    def export_data(self, data_list: List[Dict], format_type: str = 'csv') -> Tuple[str, str]:
        df = pd.DataFrame(data_list)
        
        columns = ['timestamp', 'location', 'latitude', 'longitude', 
                   'temperature', 'humidity', 'pressure', 
                   'wind_speed', 'wind_direction', 
                   'precipitation', 'data_source', 'quality_score']
        
        export_df = pd.DataFrame()
        for col in columns:
            if col in df.columns:
                export_df[col] = df[col]

        timestamp_col = 'timestamp'
        if timestamp_col in export_df.columns:
            export_df[timestamp_col] = pd.to_datetime(export_df[timestamp_col]).dt.strftime('%Y-%m-%d %H:%M:%S')

        filename = f"weather_data_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        if format_type == 'csv':
            content = export_df.to_csv(index=False, encoding='utf-8-sig')
            return f"{filename}.csv", content
        elif format_type == 'excel':
            import io
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                export_df.to_excel(writer, index=False, sheet_name='Weather Data')
            content = output.getvalue()
            return f"{filename}.xlsx", content
        else:
            raise ValueError(f"Unsupported format: {format_type}")

    def get_prediction_summary(self, historical_data: List[Dict], days_ahead: int = 7) -> Dict:
        prediction_result = self.predict_trend(historical_data, days_ahead)
        if 'error' in prediction_result:
            return prediction_result

        predictions = prediction_result['predictions']
        summary = {}

        for metric, data in predictions.items():
            if not data:
                continue
            values = [d['value'] for d in data]
            summary[metric] = {
                'min': round(min(values), 2),
                'max': round(max(values), 2),
                'avg': round(sum(values) / len(values), 2),
                'trend': prediction_result['trend_analysis'].get(metric, {}).get('trend', 'stable'),
                'days_predicted': len(data)
            }

        return {
            'summary': summary,
            'model_evaluation': prediction_result['model_evaluation'],
            'prediction_days': days_ahead
        }
