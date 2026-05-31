from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import torch
from transformers import AutoTokenizer, AutoModel
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import re
import ast
from typing import List, Dict, Any, Optional, Tuple

app = FastAPI(title="Code Smell Detection API", version="1.0.0")

tokenizer = AutoTokenizer.from_pretrained("microsoft/codebert-base")
model = AutoModel.from_pretrained("microsoft/codebert-base")

LONG_METHOD_THRESHOLD = 30


class CodeRequest(BaseModel):
    code: str
    language: str = "python"


class RefactoringSuggestion(BaseModel):
    suggestion_type: str
    start_line: int
    end_line: int
    description: str
    suggested_code: str = ""


class SmellLocation(BaseModel):
    start_line: int
    end_line: int
    description: str
    refactoring_suggestions: List[RefactoringSuggestion] = []


class SmellResult(BaseModel):
    smell_type: str
    detected: bool
    locations: List[SmellLocation] = []
    confidence: float = 0.0


class CodeResponse(BaseModel):
    has_smell: bool
    smells: List[SmellResult]
    total_lines: int


def get_code_embedding(code: str) -> np.ndarray:
    inputs = tokenizer(code, return_tensors="pt", truncation=True, max_length=512, padding=True)
    with torch.no_grad():
        outputs = model(**inputs)
    embeddings = outputs.last_hidden_state.mean(dim=1).numpy()
    return embeddings.flatten()


def extract_methods(code: str, language: str) -> List[Dict[str, Any]]:
    methods = []
    lines = code.split('\n')
    
    if language.lower() in ['python', 'py']:
        method_pattern = r'^\s*def\s+(\w+)\s*\('
        current_method = None
        current_start = -1
        base_indent = 0
        
        for i, line in enumerate(lines, 1):
            match = re.match(method_pattern, line)
            if match:
                if current_method is not None:
                    methods.append({
                        'name': current_method,
                        'start_line': current_start,
                        'end_line': i - 1,
                        'code': '\n'.join(lines[current_start - 1:i - 1])
                    })
                current_method = match.group(1)
                current_start = i
                base_indent = len(line) - len(line.lstrip())
            elif current_method and line.strip() and len(line) - len(line.lstrip()) <= base_indent and not line.strip().startswith('#'):
                methods.append({
                    'name': current_method,
                    'start_line': current_start,
                    'end_line': i - 1,
                    'code': '\n'.join(lines[current_start - 1:i - 1])
                })
                current_method = None
        
        if current_method:
            methods.append({
                'name': current_method,
                'start_line': current_start,
                'end_line': len(lines),
                'code': '\n'.join(lines[current_start - 1:])
            })
    
    elif language.lower() in ['java', 'go', 'c', 'cpp', 'csharp', 'js', 'javascript']:
        method_patterns = [
            r'(?:public|private|protected|static|final|func|function)\s+\w+\s+(\w+)\s*\(',
            r'(?:public|private|protected|static|final|func|function)\s+(\w+)\s*\(',
        ]
        
        brace_stack = []
        current_method = None
        current_start = -1
        
        for i, line in enumerate(lines, 1):
            for pattern in method_patterns:
                match = re.search(pattern, line)
                if match:
                    current_method = match.group(1)
                    current_start = i
                    break
            
            if '{' in line:
                brace_stack.append(i)
            if '}' in line and brace_stack:
                brace_stack.pop()
                if current_method and not brace_stack:
                    methods.append({
                        'name': current_method,
                        'start_line': current_start,
                        'end_line': i,
                        'code': '\n'.join(lines[current_start - 1:i])
                    })
                    current_method = None
    
    return methods


def analyze_python_ast_for_extraction(method_code: str, method_start_line: int) -> List[RefactoringSuggestion]:
    suggestions = []
    try:
        tree = ast.parse(method_code)
        method_lines = method_code.split('\n')
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.For, ast.While, ast.If)):
                if hasattr(node, 'lineno') and hasattr(node, 'end_lineno'):
                    block_lines = node.end_lineno - node.lineno + 1
                    if block_lines >= 5:
                        block_code = '\n'.join(method_lines[node.lineno - 1:node.end_lineno])
                        
                        block_type = "Loop" if isinstance(node, (ast.For, ast.While)) else "Conditional"
                        
                        suggested_func_name = f"extract_{block_type.lower()}_block"
                        
                        indent_level = len(method_lines[node.lineno - 1]) - len(method_lines[node.lineno - 1].lstrip())
                        indent = ' ' * indent_level
                        
                        suggested_func_code = block_code.strip()
                        suggested_func_code = '\n'.join(' ' * 4 + line[min(4, len(line) - len(line.lstrip())):] for line in suggested_func_code.split('\n') if line.strip())
                        
                        suggested_func = f"def {suggested_func_name}(data):\n{suggested_func_code}\n{indent}    return result\n\n{indent}{suggested_func_name}(data)"
                        
                        suggestions.append(RefactoringSuggestion(
                            suggestion_type="Extract Method",
                            start_line=method_start_line + node.lineno - 1,
                            end_line=method_start_line + node.end_lineno - 1,
                            description=f"Extract {block_type} block (lines {node.lineno}-{node.end_lineno}) into a separate method",
                            suggested_code=suggested_func
                        ))
            
            elif isinstance(node, ast.With):
                if hasattr(node, 'lineno') and hasattr(node, 'end_lineno'):
                    block_lines = node.end_lineno - node.lineno + 1
                    if block_lines >= 5:
                        suggestions.append(RefactoringSuggestion(
                            suggestion_type="Extract Method",
                            start_line=method_start_line + node.lineno - 1,
                            end_line=method_start_line + node.end_lineno - 1,
                            description=f"Extract 'with' block (lines {node.lineno}-{node.end_lineno}) into a separate method"
                        ))
        
        if len(suggestions) == 0:
            total_lines = len(method_lines)
            if total_lines > 20:
                mid_point = total_lines // 2
                suggestions.append(RefactoringSuggestion(
                    suggestion_type="Extract Method",
                    start_line=method_start_line + mid_point - 5,
                    end_line=method_start_line + mid_point + 5,
                    description=f"Consider splitting method around lines {mid_point - 5}-{mid_point + 5}",
                    suggested_code=""
                ))
    
    except SyntaxError:
        pass
    
    return suggestions[:3]


def detect_long_method(code: str, language: str) -> SmellResult:
    methods = extract_methods(code, language)
    locations = []
    max_confidence = 0.0
    
    for method in methods:
        method_lines = method['end_line'] - method['start_line'] + 1
        if method_lines > LONG_METHOD_THRESHOLD:
            confidence = min(1.0, (method_lines - LONG_METHOD_THRESHOLD) / 50)
            max_confidence = max(max_confidence, confidence)
            
            refactoring_suggestions = []
            if language.lower() == 'python':
                refactoring_suggestions = analyze_python_ast_for_extraction(
                    method['code'], 
                    method['start_line']
                )
            
            locations.append(SmellLocation(
                start_line=method['start_line'],
                end_line=method['end_line'],
                description=f"Method '{method['name']}' has {method_lines} lines (threshold: {LONG_METHOD_THRESHOLD})",
                refactoring_suggestions=refactoring_suggestions
            ))
    
    return SmellResult(
        smell_type="Long Method",
        detected=len(locations) > 0,
        locations=locations,
        confidence=max_confidence
    )


def is_getter_setter(method_name: str, method_code: str) -> bool:
    getter_setter_patterns = [
        r'^get[A-Z_]',
        r'^set[A-Z_]',
        r'^is[A-Z_]',
        r'^has[A-Z_]',
        r'^get_',
        r'^set_',
        r'^is_',
        r'^has_',
    ]
    
    for pattern in getter_setter_patterns:
        if re.match(pattern, method_name, re.IGNORECASE):
            return True
    
    simple_patterns = [
        r'return\s+self\.',
        r'self\.\w+\s*=',
        r'return\s+this\.',
        r'this\.\w+\s*=',
        r'return\s+\w+;',
        r'\w+\s*=\s*.*;',
    ]
    
    for pattern in simple_patterns:
        if re.search(pattern, method_code):
            lines = method_code.strip().split('\n')
            if len(lines) <= 5:
                return True
    
    return False


def detect_duplicated_code(code: str, language: str) -> SmellResult:
    methods = extract_methods(code, language)
    locations = []
    max_confidence = 0.0
    
    MIN_METHOD_LINES = 10
    SIMILARITY_THRESHOLD = 0.95
    
    if len(methods) < 2:
        return SmellResult(
            smell_type="Duplicated Code",
            detected=False,
            locations=[],
            confidence=0.0
        )
    
    embeddings = []
    for method in methods:
        method_lines = method['end_line'] - method['start_line'] + 1
        if method_lines < MIN_METHOD_LINES:
            continue
        if is_getter_setter(method['name'], method['code']):
            continue
        
        emb = get_code_embedding(method['code'])
        embeddings.append((method, emb))
    
    for i, (method1, emb1) in enumerate(embeddings):
        for j, (method2, emb2) in enumerate(embeddings):
            if i >= j:
                continue
            
            similarity = cosine_similarity([emb1], [emb2])[0][0]
            
            if similarity > SIMILARITY_THRESHOLD:
                confidence = similarity
                max_confidence = max(max_confidence, confidence)
                locations.append(SmellLocation(
                    start_line=method1['start_line'],
                    end_line=method1['end_line'],
                    description=f"Method '{method1['name']}' is similar to '{method2['name']}' (similarity: {similarity:.2f})"
                ))
    
    return SmellResult(
        smell_type="Duplicated Code",
        detected=len(locations) > 0,
        locations=locations,
        confidence=max_confidence
    )


@app.post("/analyze", response_model=CodeResponse)
async def analyze_code(request: CodeRequest):
    try:
        total_lines = len(request.code.split('\n'))
        
        long_method_result = detect_long_method(request.code, request.language)
        duplicated_code_result = detect_duplicated_code(request.code, request.language)
        
        all_smells = [long_method_result, duplicated_code_result]
        has_smell = any(smell.detected for smell in all_smells)
        
        return CodeResponse(
            has_smell=has_smell,
            smells=all_smells,
            total_lines=total_lines
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    return {"status": "healthy", "model": "codebert-base"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
