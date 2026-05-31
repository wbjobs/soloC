from app import db, scheduler
from app.models import Chart
from app.services import DataQueryService
from datetime import datetime

class RefreshService:
    
    @staticmethod
    def start_auto_refresh():
        if scheduler.running:
            scheduler.remove_all_jobs()
        
        scheduler.add_job(
            RefreshService.check_and_refresh,
            'interval',
            minutes=1,
            id='chart_refresh_job',
            replace_existing=True
        )
    
    @staticmethod
    def check_and_refresh():
        with scheduler.app.app_context():
            charts = Chart.query.filter(Chart.refresh_interval > 0).all()
            
            for chart in charts:
                try:
                    RefreshService.refresh_chart(chart)
                except Exception as e:
                    print(f"Error refreshing chart {chart.id}: {e}")
    
    @staticmethod
    def refresh_chart(chart):
        from app.models import DataSource
        
        if not chart.data_source_id or not chart.query_sql:
            return
        
        data_source = DataSource.query.get(chart.data_source_id)
        if not data_source:
            return
        
        result, error = DataQueryService.execute_query(data_source, chart.query_sql)
        
        if not error:
            chart.last_refreshed = datetime.utcnow()
            db.session.commit()
    
    @staticmethod
    def get_interval_options():
        return [
            {'value': 0, 'label': '不自动刷新'},
            {'value': 1, 'label': '每1分钟'},
            {'value': 5, 'label': '每5分钟'},
            {'value': 30, 'label': '每30分钟'}
        ]
