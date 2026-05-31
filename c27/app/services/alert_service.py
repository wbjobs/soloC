import smtplib
import json
import requests
from email.mime.text import MIMEText
from email.header import Header
from datetime import datetime, timedelta
from app.models import AlertRule, AlertHistory, Chart, DataSource
from app.services import DataQueryService

class AlertService:
    
    @staticmethod
    def check_and_trigger_alerts(app):
        with app.app_context():
            from app import db
            
            active_rules = AlertRule.query.filter_by(is_enabled=True).all()
            
            for rule in active_rules:
                try:
                    AlertService._check_single_rule(rule, db)
                except Exception as e:
                    print(f"Error checking alert rule {rule.id}: {e}")
    
    @staticmethod
    def _check_single_rule(rule, db):
        chart = Chart.query.get(rule.chart_id)
        if not chart or not chart.data_source_id or not chart.query_sql:
            return
        
        data_source = DataSource.query.get(chart.data_source_id)
        if not data_source:
            return
        
        data, error = DataQueryService.execute_query(data_source, chart.query_sql, limit=1000)
        if error:
            print(f"Error getting data for chart {chart.id}: {error}")
            return
        
        if not data:
            return
        
        compare_value = AlertService._get_compare_value(data, rule)
        if compare_value is None:
            return
        
        is_triggered = AlertService._evaluate_condition(compare_value, rule.condition_type, rule.threshold)
        
        if is_triggered:
            if AlertService._is_in_cooldown(rule):
                return
            
            AlertService._trigger_alert(rule, compare_value, db)
    
    @staticmethod
    def _get_compare_value(data, rule):
        if not data:
            return None
        
        field = rule.compare_field
        agg_func = rule.aggregate_function or 'latest'
        
        values = []
        for row in data:
            if field and field in row:
                try:
                    values.append(float(row[field]))
                except (ValueError, TypeError):
                    continue
            else:
                for key, val in row.items():
                    try:
                        values.append(float(val))
                        break
                    except (ValueError, TypeError):
                        continue
        
        if not values:
            return None
        
        if agg_func == 'latest':
            return values[-1]
        elif agg_func == 'max':
            return max(values)
        elif agg_func == 'min':
            return min(values)
        elif agg_func == 'avg':
            return sum(values) / len(values)
        elif agg_func == 'sum':
            return sum(values)
        
        return values[-1]
    
    @staticmethod
    def _evaluate_condition(value, condition_type, threshold):
        if value is None:
            return False
        
        if condition_type == 'greater_than':
            return value > threshold
        elif condition_type == 'less_than':
            return value < threshold
        elif condition_type == 'greater_than_or_equal':
            return value >= threshold
        elif condition_type == 'less_than_or_equal':
            return value <= threshold
        elif condition_type == 'equal':
            return abs(value - threshold) < 0.0001
        
        return False
    
    @staticmethod
    def _is_in_cooldown(rule):
        if not rule.last_triggered or not rule.cooldown_minutes:
            return False
        
        cooldown_end = rule.last_triggered + timedelta(minutes=rule.cooldown_minutes)
        return datetime.utcnow() < cooldown_end
    
    @staticmethod
    def _trigger_alert(rule, trigger_value, db):
        condition_text = {
            'greater_than': '大于',
            'less_than': '小于',
            'greater_than_or_equal': '大于等于',
            'less_than_or_equal': '小于等于',
            'equal': '等于'
        }.get(rule.condition_type, rule.condition_type)
        
        chart = Chart.query.get(rule.chart_id)
        message = f"""
【数据告警】{rule.name}

告警条件：数据值 {condition_text} {rule.threshold}
当前值：{trigger_value}
图表：{chart.name if chart else '未知'}
触发时间：{datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}
"""
        
        history = AlertHistory(
            alert_rule_id=rule.id,
            trigger_value=trigger_value,
            threshold_value=rule.threshold,
            condition_type=rule.condition_type,
            message=message,
            status='pending'
        )
        
        db.session.add(history)
        
        sent_email = False
        sent_wechat = False
        error_msg = None
        
        if rule.notify_email:
            try:
                emails = [e.strip() for e in rule.notify_email.split(',') if e.strip()]
                for email in emails:
                    AlertService._send_email(email, f"[数据告警] {rule.name}", message)
                sent_email = True
            except Exception as e:
                error_msg = f"Email error: {str(e)}"
        
        if rule.notify_wechat:
            try:
                webhooks = [w.strip() for w in rule.notify_wechat.split(',') if w.strip()]
                for webhook in webhooks:
                    AlertService._send_wechat_webhook(webhook, message)
                sent_wechat = True
            except Exception as e:
                if error_msg:
                    error_msg += f"; WeChat error: {str(e)}"
                else:
                    error_msg = f"WeChat error: {str(e)}"
        
        history.sent_email = sent_email
        history.sent_wechat = sent_wechat
        history.error_message = error_msg
        history.status = 'sent' if (sent_email or sent_wechat) else 'failed'
        
        rule.last_triggered = datetime.utcnow()
        
        db.session.commit()
    
    @staticmethod
    def _send_email(to_email, subject, body):
        import os
        
        smtp_host = os.environ.get('SMTP_HOST', 'smtp.example.com')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER', 'your_email@example.com')
        smtp_password = os.environ.get('SMTP_PASSWORD', 'your_password')
        smtp_from = os.environ.get('SMTP_FROM', smtp_user)
        use_tls = os.environ.get('SMTP_TLS', 'true').lower() == 'true'
        
        if 'example.com' in smtp_host:
            print(f"[EMAIL NOT CONFIGURED] Would send to {to_email}: {subject}")
            return
        
        msg = MIMEText(body, 'plain', 'utf-8')
        msg['From'] = Header(smtp_from, 'utf-8')
        msg['To'] = Header(to_email, 'utf-8')
        msg['Subject'] = Header(subject, 'utf-8')
        
        server = smtplib.SMTP(smtp_host, smtp_port)
        if use_tls:
            server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_from, [to_email], msg.as_string())
        server.quit()
    
    @staticmethod
    def _send_wechat_webhook(webhook_url, message):
        if 'placeholder' in webhook_url or not webhook_url.startswith('http'):
            print(f"[WECHAT NOT CONFIGURED] Would send to webhook: {message[:100]}...")
            return
        
        payload = {
            "msgtype": "text",
            "text": {
                "content": message
            }
        }
        
        response = requests.post(webhook_url, json=payload, timeout=10)
        if response.status_code != 200:
            raise Exception(f"WeChat webhook failed: {response.text}")
        
        result = response.json()
        if result.get('errcode', 0) != 0:
            raise Exception(f"WeChat webhook error: {result.get('errmsg', 'Unknown error')}")
    
    @staticmethod
    def get_condition_options():
        return [
            {'value': 'greater_than', 'label': '大于 >'},
            {'value': 'less_than', 'label': '小于 <'},
            {'value': 'greater_than_or_equal', 'label': '大于等于 ≥'},
            {'value': 'less_than_or_equal', 'label': '小于等于 ≤'},
            {'value': 'equal', 'label': '等于 ='}
        ]
    
    @staticmethod
    def get_aggregate_options():
        return [
            {'value': 'latest', 'label': '最新值'},
            {'value': 'max', 'label': '最大值'},
            {'value': 'min', 'label': '最小值'},
            {'value': 'avg', 'label': '平均值'},
            {'value': 'sum', 'label': '求和'}
        ]
    
    @staticmethod
    def get_interval_options():
        return [
            {'value': 1, 'label': '每1分钟'},
            {'value': 5, 'label': '每5分钟'},
            {'value': 15, 'label': '每15分钟'},
            {'value': 30, 'label': '每30分钟'},
            {'value': 60, 'label': '每1小时'}
        ]
    
    @staticmethod
    def get_cooldown_options():
        return [
            {'value': 5, 'label': '5分钟'},
            {'value': 15, 'label': '15分钟'},
            {'value': 30, 'label': '30分钟'},
            {'value': 60, 'label': '1小时'},
            {'value': 360, 'label': '6小时'}
        ]
