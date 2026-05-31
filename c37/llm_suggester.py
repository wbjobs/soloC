import os
import json
from typing import Dict, List
from dotenv import load_dotenv


load_dotenv()


class CodeSuggester:
    def __init__(self, use_local=False):
        self.use_local = use_local
        self.openai_client = None
        
        if not use_local:
            try:
                from openai import OpenAI
                self.openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
            except ImportError:
                print("OpenAI not installed, using mock suggestions")
    
    def _mock_refactor_suggestion(self, func_name, code):
        lines = code.split('\n')
        line_count = len(lines)
        
        suggestion = {
            'problem': f'函数 {func_name} 过长 ({line_count} 行)',
            'suggestion': '建议拆分为多个职责单一的小函数',
            'refactored_code': self._generate_mock_refactor(code, func_name),
            'steps': [
                '1. 提取数据验证逻辑到独立函数',
                '2. 提取核心业务逻辑到独立函数',
                '3. 提取结果格式化/返回逻辑',
                '4. 保持原函数作为协调器'
            ]
        }
        return suggestion
    
    def _generate_mock_refactor(self, code, func_name):
        lines = code.split('\n')
        indent = ''
        for line in lines:
            if line.strip() and line.startswith('def '):
                indent = '    '
                break
        
        mock_code = f"""# 重构建议：将 {func_name} 拆分为多个函数

def validate_input(data):
    \"\"\"验证输入数据\"\"\"
    # 提取原函数中的验证逻辑
    pass

def process_data(data):
    \"\"\"核心业务处理逻辑\"\"\"
    # 提取原函数中的处理逻辑
    pass

def format_result(result):
    \"\"\"格式化返回结果\"\"\"
    # 提取原函数中的格式化逻辑
    pass

def {func_name}(data):
    \"\"\"协调器函数 - 保持原接口\"\"\"
    validate_input(data)
    result = process_data(data)
    return format_result(result)
"""
        return mock_code
    
    def suggest_long_function_refactor(self, func_name: str, code: str, smell_description: str = "长函数"):
        if self.use_local or not self.openai_client:
            return self._mock_refactor_suggestion(func_name, code)
        
        try:
            prompt = f"""
请分析以下Python函数并生成重构建议。这是一个检测到的"{smell_description}"代码异味。

函数名: {func_name}

代码:
{code}

请按以下格式返回JSON:
{{
    "problem": "问题描述",
    "suggestion": "整体重构建议",
    "refactored_code": "重构后的示例代码",
    "steps": ["步骤1", "步骤2", ...]
}}
"""
            
            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "你是一个专业的代码重构专家，擅长识别和修复代码异味。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=2000
            )
            
            content = response.choices[0].message.content
            
            try:
                result = json.loads(content)
            except:
                json_start = content.find('{')
                json_end = content.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    result = json.loads(content[json_start:json_end])
                else:
                    result = {
                        'problem': f'函数 {func_name} 代码过长',
                        'suggestion': content,
                        'refactored_code': '# 请参考上述建议进行重构',
                        'steps': []
                    }
            
            return result
            
        except Exception as e:
            print(f"LLM error: {e}")
            return self._mock_refactor_suggestion(func_name, code)


class FeedbackStore:
    def __init__(self, db_path="./feedback_db.json"):
        self.db_path = db_path
        self.feedback_data = self._load_data()
    
    def _load_data(self):
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                pass
        return {'feedbacks': [], 'code_weights': {}}
    
    def _save_data(self):
        with open(self.db_path, 'w', encoding='utf-8') as f:
            json.dump(self.feedback_data, f, ensure_ascii=False, indent=2)
    
    def add_feedback(self, func_id: str, func_name: str, file_path: str, 
                     code: str, suggestion: Dict, feedback: str):
        feedback_entry = {
            'func_id': func_id,
            'func_name': func_name,
            'file_path': file_path,
            'code_snippet': code[:500],
            'suggestion': suggestion,
            'feedback': feedback,
            'timestamp': str(os.times())
        }
        self.feedback_data['feedbacks'].append(feedback_entry)
        
        code_key = f"{file_path}:{func_name}"
        if code_key not in self.feedback_data['code_weights']:
            self.feedback_data['code_weights'][code_key] = 1.0
        
        if feedback == 'useful':
            self.feedback_data['code_weights'][code_key] *= 1.1
        elif feedback == 'not_useful':
            self.feedback_data['code_weights'][code_key] *= 0.9
        
        self._save_data()
        return self.feedback_data['code_weights'][code_key]
    
    def get_code_weight(self, file_path: str, func_name: str):
        code_key = f"{file_path}:{func_name}"
        return self.feedback_data['code_weights'].get(code_key, 1.0)
    
    def get_all_weights(self):
        return self.feedback_data['code_weights']
    
    def get_feedback_stats(self):
        total = len(self.feedback_data['feedbacks'])
        useful = sum(1 for f in self.feedback_data['feedbacks'] if f['feedback'] == 'useful')
        not_useful = total - useful
        return {
            'total': total,
            'useful': useful,
            'not_useful': not_useful
        }
