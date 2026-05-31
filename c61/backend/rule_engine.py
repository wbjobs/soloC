import json
from typing import Dict, List, Any, Optional

class RuleCondition:
    def __init__(self, condition_type: str, value: Any = None, children: List = None):
        self.type = condition_type
        self.value = value
        self.children = children or []

class RuleAction:
    def __init__(self, action_type: str, register_address: int = None, value: Any = None):
        self.type = action_type
        self.register_address = register_address
        self.value = value

class RuleEngine:
    def __init__(self):
        pass
    
    def parse_condition(self, condition_data: Dict) -> RuleCondition:
        cond_type = condition_data.get('type')
        
        if cond_type in ['AND', 'OR']:
            children = [self.parse_condition(child) for child in condition_data.get('children', [])]
            return RuleCondition(cond_type, children=children)
        elif cond_type == 'NOT':
            child = self.parse_condition(condition_data.get('child', {}))
            return RuleCondition('NOT', children=[child])
        elif cond_type == 'COMPARISON':
            return RuleCondition(
                'COMPARISON',
                value={
                    'register': condition_data.get('register'),
                    'operator': condition_data.get('operator'),
                    'value': condition_data.get('value')
                }
            )
        else:
            raise ValueError(f"Unknown condition type: {cond_type}")
    
    def evaluate_condition(self, condition: RuleCondition, registers: List[float]) -> bool:
        if condition.type == 'AND':
            return all(self.evaluate_condition(child, registers) for child in condition.children)
        elif condition.type == 'OR':
            return any(self.evaluate_condition(child, registers) for child in condition.children)
        elif condition.type == 'NOT':
            return not self.evaluate_condition(condition.children[0], registers)
        elif condition.type == 'COMPARISON':
            reg_addr = condition.value['register']
            operator = condition.value['operator']
            compare_value = condition.value['value']
            
            if reg_addr >= len(registers):
                return False
            
            current_value = registers[reg_addr]
            
            operators = {
                '>': lambda a, b: a > b,
                '>=': lambda a, b: a >= b,
                '<': lambda a, b: a < b,
                '<=': lambda a, b: a <= b,
                '==': lambda a, b: abs(a - b) < 0.0001,
                '!=': lambda a, b: abs(a - b) >= 0.0001
            }
            
            if operator not in operators:
                raise ValueError(f"Unknown operator: {operator}")
            
            return operators[operator](current_value, compare_value)
        else:
            raise ValueError(f"Unknown condition type: {condition.type}")
    
    def parse_actions(self, actions_data: List[Dict]) -> List[RuleAction]:
        actions = []
        for action_data in actions_data:
            action_type = action_data.get('type')
            if action_type == 'SET_REGISTER':
                actions.append(RuleAction(
                    'SET_REGISTER',
                    register_address=action_data.get('register'),
                    value=action_data.get('value')
                ))
            elif action_type == 'ALARM':
                actions.append(RuleAction(
                    'ALARM',
                    value=action_data.get('message', '')
                ))
        return actions
    
    def execute_actions(self, actions: List[RuleAction], registers: List[float]) -> Dict:
        result = {
            'register_changes': {},
            'alarms': [],
            'messages': []
        }
        
        for action in actions:
            if action.type == 'SET_REGISTER':
                reg_addr = action.register_address
                if 0 <= reg_addr < len(registers):
                    old_value = registers[reg_addr]
                    new_value = float(action.value)
                    registers[reg_addr] = new_value
                    result['register_changes'][reg_addr] = {
                        'old': old_value,
                        'new': new_value
                    }
                    result['messages'].append(f"寄存器 {reg_addr} 从 {old_value} 设为 {new_value}")
            elif action.type == 'ALARM':
                result['alarms'].append(str(action.value))
                result['messages'].append(f"触发报警: {action.value}")
        
        return result
    
    def execute_rule(self, rule_data: Dict, registers: List[float]) -> Dict:
        try:
            condition = self.parse_condition(rule_data.get('condition', {}))
            actions = self.parse_actions(rule_data.get('actions', []))
            
            condition_met = self.evaluate_condition(condition, registers)
            
            result = {
                'triggered': False,
                'condition_met': condition_met,
                'register_changes': {},
                'alarms': [],
                'messages': []
            }
            
            if condition_met and actions:
                action_result = self.execute_actions(actions, registers)
                result['triggered'] = True
                result['register_changes'] = action_result['register_changes']
                result['alarms'] = action_result['alarms']
                result['messages'] = action_result['messages']
            
            return result
        except Exception as e:
            return {
                'triggered': False,
                'condition_met': False,
                'error': str(e),
                'messages': [f"规则执行错误: {str(e)}"]
            }

rule_engine = RuleEngine()

def build_condition_from_ui(ui_data: Dict) -> Dict:
    cond_type = ui_data.get('type')
    
    if cond_type in ['AND', 'OR']:
        return {
            'type': cond_type,
            'children': [build_condition_from_ui(child) for child in ui_data.get('children', [])]
        }
    elif cond_type == 'NOT':
        return {
            'type': 'NOT',
            'child': build_condition_from_ui(ui_data.get('child', {}))
        }
    elif cond_type == 'COMPARISON':
        return {
            'type': 'COMPARISON',
            'register': ui_data.get('register'),
            'operator': ui_data.get('operator'),
            'value': ui_data.get('value')
        }
    else:
        raise ValueError(f"Unknown condition type: {cond_type}")
