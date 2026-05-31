import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from collections import defaultdict

class TraceAnalyzer:
    def __init__(self, logs: List[Dict[str, Any]]):
        self.logs = logs
        self.span_map = {log['span_id']: log for log in logs}
        self.children_map = defaultdict(list)
        for log in logs:
            if log['parent_span_id']:
                self.children_map[log['parent_span_id']].append(log)

    def _parse_timestamp(self, timestamp_str: str) -> datetime:
        try:
            if timestamp_str.endswith('Z'):
                return datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            return datetime.fromisoformat(timestamp_str)
        except (ValueError, TypeError):
            return datetime.min

    def find_root_cause(self) -> Dict[str, Any]:
        earliest_error: Optional[Dict[str, Any]] = None
        earliest_error_time: Optional[datetime] = None
        max_duration_span: Optional[Dict[str, Any]] = None
        max_duration = -1

        for log in self.logs:
            if log['error_code']:
                log_time = self._parse_timestamp(log['timestamp'])
                if earliest_error_time is None or log_time < earliest_error_time:
                    earliest_error_time = log_time
                    earliest_error = log
            
            if log['duration'] > max_duration:
                max_duration = log['duration']
                max_duration_span = log

        if earliest_error:
            return {
                'span_id': earliest_error['span_id'],
                'reason': f'Earliest error occurred: {earliest_error["error_code"]}',
                'service_name': earliest_error['service_name'],
                'error_code': earliest_error['error_code'],
                'duration': earliest_error['duration'],
                'timestamp': earliest_error['timestamp']
            }
        
        if max_duration_span:
            return {
                'span_id': max_duration_span['span_id'],
                'reason': f'Longest duration: {max_duration}ms',
                'service_name': max_duration_span['service_name'],
                'error_code': max_duration_span['error_code'],
                'duration': max_duration_span['duration'],
                'timestamp': max_duration_span['timestamp']
            }

        return {}

    def generate_dot_graph(self, root_cause: Dict[str, Any]) -> str:
        lines = ['digraph TraceGraph {']
        lines.append('    rankdir=TB;')
        lines.append('    node [shape=box, style=filled, fontname="Arial"];')
        lines.append('    edge [fontname="Arial"];')

        root_cause_span_id = root_cause.get('span_id')

        for log in self.logs:
            span_id = log['span_id']
            label = f'{log["service_name"]}\\n{log["operation"]}\\n{log["duration"]}ms'
            
            if log['error_code']:
                label += f'\\n{log["error_code"]}'

            if span_id == root_cause_span_id:
                color = 'red'
                fontcolor = 'white'
            elif log['error_code']:
                color = 'orange'
                fontcolor = 'black'
            else:
                color = 'lightblue'
                fontcolor = 'black'

            lines.append(f'    "{span_id}" [label="{label}", fillcolor="{color}", fontcolor="{fontcolor}"];')

        for log in self.logs:
            if log['parent_span_id'] and log['parent_span_id'] in self.span_map:
                lines.append(f'    "{log["parent_span_id"]}" -> "{log["span_id"]}";')

        lines.append('}')
        return '\n'.join(lines)

    def generate_json_summary(self, root_cause: Dict[str, Any]) -> str:
        total_duration = sum(log['duration'] for log in self.logs)
        error_count = sum(1 for log in self.logs if log['error_code'])
        service_stats = defaultdict(lambda: {'count': 0, 'total_duration': 0, 'errors': 0})

        for log in self.logs:
            service = log['service_name']
            service_stats[service]['count'] += 1
            service_stats[service]['total_duration'] += log['duration']
            if log['error_code']:
                service_stats[service]['errors'] += 1

        summary = {
            'trace_id': self.logs[0]['trace_id'] if self.logs else '',
            'total_spans': len(self.logs),
            'total_duration_ms': total_duration,
            'error_count': error_count,
            'services': dict(service_stats),
            'root_cause': root_cause
        }

        return json.dumps(summary, indent=2, ensure_ascii=False)
