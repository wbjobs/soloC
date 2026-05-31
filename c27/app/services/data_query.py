import os
import json
import time
import pymysql
import psycopg2
import psycopg2.extras
import pandas as pd
import requests
from flask import current_app
from threading import Lock

_csv_cache = {}
_csv_cache_lock = Lock()
_CSV_CACHE_TTL = 300

class DataQueryService:
    
    @staticmethod
    def test_connection(data_source):
        try:
            if data_source.type == 'mysql':
                conn = pymysql.connect(
                    host=data_source.host,
                    port=data_source.port or 3306,
                    user=data_source.username,
                    password=data_source.password,
                    database=data_source.database
                )
                conn.close()
                return True, '连接成功'
            
            elif data_source.type == 'postgresql':
                conn = psycopg2.connect(
                    host=data_source.host,
                    port=data_source.port or 5432,
                    user=data_source.username,
                    password=data_source.password,
                    database=data_source.database
                )
                conn.close()
                return True, '连接成功'
            
            elif data_source.type == 'csv':
                if data_source.file_path and os.path.exists(data_source.file_path):
                    return True, '文件存在'
                return False, '文件不存在'
            
            elif data_source.type == 'api':
                if data_source.api_url:
                    headers = json.loads(data_source.api_headers) if data_source.api_headers else {}
                    response = requests.request(
                        data_source.api_method or 'GET',
                        data_source.api_url,
                        headers=headers,
                        timeout=10
                    )
                    if response.status_code < 400:
                        return True, f'API可用，状态码: {response.status_code}'
                return False, 'API不可访问'
            
            return False, '不支持的数据源类型'
        except Exception as e:
            return False, str(e)
    
    @staticmethod
    def execute_query(data_source, query, limit=1000):
        try:
            if data_source.type in ['mysql', 'postgresql']:
                return DataQueryService._execute_sql(data_source, query, limit)
            
            elif data_source.type == 'csv':
                return DataQueryService._execute_csv(data_source, query)
            
            elif data_source.type == 'api':
                return DataQueryService._execute_api(data_source)
            
            return [], '不支持的数据源类型'
        except Exception as e:
            return [], str(e)
    
    @staticmethod
    def _execute_sql(data_source, query, limit):
        conn = None
        try:
            if data_source.type == 'mysql':
                conn = pymysql.connect(
                    host=data_source.host,
                    port=data_source.port or 3306,
                    user=data_source.username,
                    password=data_source.password,
                    database=data_source.database,
                    cursorclass=pymysql.cursors.DictCursor
                )
                cursor = conn.cursor()
                if limit and 'LIMIT' not in query.upper():
                    query = f"{query} LIMIT {limit}"
                cursor.execute(query)
                result = cursor.fetchall()
                return result, None
            
            elif data_source.type == 'postgresql':
                conn = psycopg2.connect(
                    host=data_source.host,
                    port=data_source.port or 5432,
                    user=data_source.username,
                    password=data_source.password,
                    database=data_source.database
                )
                cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                if limit and 'LIMIT' not in query.upper():
                    query = f"{query} LIMIT {limit}"
                cursor.execute(query)
                result = cursor.fetchall()
                return [dict(row) for row in result], None
                
        finally:
            if conn:
                conn.close()
    
    @staticmethod
    def _execute_csv(data_source, query):
        if not data_source.file_path or not os.path.exists(data_source.file_path):
            return [], 'CSV文件不存在'
        
        file_path = data_source.file_path
        current_mtime = os.path.getmtime(file_path)
        current_time = time.time()
        
        with _csv_cache_lock:
            cached = _csv_cache.get(file_path)
            if cached:
                if cached['mtime'] == current_mtime and (current_time - cached['cache_time'] < _CSV_CACHE_TTL):
                    return cached['data'], None
            
            df = pd.read_csv(file_path)
            data = df.to_dict('records')
            
            _csv_cache[file_path] = {
                'data': data,
                'mtime': current_mtime,
                'cache_time': current_time
            }
            
            return data, None
    
    @staticmethod
    def invalidate_csv_cache(file_path):
        with _csv_cache_lock:
            if file_path in _csv_cache:
                del _csv_cache[file_path]
    
    @staticmethod
    def clear_all_csv_cache():
        with _csv_cache_lock:
            _csv_cache.clear()
    
    @staticmethod
    def _execute_api(data_source):
        headers = json.loads(data_source.api_headers) if data_source.api_headers else {}
        body = json.loads(data_source.api_body) if data_source.api_body else None
        
        response = requests.request(
            data_source.api_method or 'GET',
            data_source.api_url,
            headers=headers,
            json=body,
            timeout=30
        )
        
        data = response.json()
        if isinstance(data, list):
            return data, None
        elif isinstance(data, dict):
            return [data], None
        else:
            return [], '无法解析API响应'
    
    @staticmethod
    def get_tables(data_source):
        if data_source.type == 'mysql':
            conn = pymysql.connect(
                host=data_source.host,
                port=data_source.port or 3306,
                user=data_source.username,
                password=data_source.password,
                database=data_source.database
            )
            cursor = conn.cursor()
            cursor.execute("SHOW TABLES")
            tables = [row[0] for row in cursor.fetchall()]
            conn.close()
            return tables
        
        elif data_source.type == 'postgresql':
            conn = psycopg2.connect(
                host=data_source.host,
                port=data_source.port or 5432,
                user=data_source.username,
                password=data_source.password,
                database=data_source.database
            )
            cursor = conn.cursor()
            cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
            tables = [row[0] for row in cursor.fetchall()]
            conn.close()
            return tables
        
        return []
    
    @staticmethod
    def get_columns(data_source, table_name):
        if data_source.type == 'mysql':
            conn = pymysql.connect(
                host=data_source.host,
                port=data_source.port or 3306,
                user=data_source.username,
                password=data_source.password,
                database=data_source.database
            )
            cursor = conn.cursor()
            cursor.execute(f"DESCRIBE {table_name}")
            columns = [{'name': row[0], 'type': row[1]} for row in cursor.fetchall()]
            conn.close()
            return columns
        
        elif data_source.type == 'postgresql':
            conn = psycopg2.connect(
                host=data_source.host,
                port=data_source.port or 5432,
                user=data_source.username,
                password=data_source.password,
                database=data_source.database
            )
            cursor = conn.cursor()
            cursor.execute(f"""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name='{table_name}' AND table_schema='public'
            """)
            columns = [{'name': row[0], 'type': row[1]} for row in cursor.fetchall()]
            conn.close()
            return columns
        
        elif data_source.type == 'csv':
            if data_source.file_path and os.path.exists(data_source.file_path):
                df = pd.read_csv(data_source.file_path, nrows=1)
                return [{'name': col, 'type': 'string'} for col in df.columns]
        
        return []
