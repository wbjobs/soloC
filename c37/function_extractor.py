import ast
import os


class FunctionExtractor:
    def __init__(self):
        pass
        
    def extract_functions_from_file(self, file_path, repo_root):
        functions = []
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                source = f.read()
            
            tree = ast.parse(source, filename=file_path)
            lines = source.splitlines()
            
            relative_path = os.path.relpath(file_path, repo_root)
            
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    func_info = self._extract_function_info(node, lines, relative_path, file_path)
                    functions.append(func_info)
                elif isinstance(node, ast.AsyncFunctionDef):
                    func_info = self._extract_function_info(node, lines, relative_path, file_path)
                    functions.append(func_info)
                    
        except Exception as e:
            print(f"Error parsing {file_path}: {e}")
            
        return functions
    
    def _extract_function_info(self, node, lines, relative_path, full_path):
        start_line = node.lineno - 1
        end_line = node.end_lineno if node.end_lineno else start_line + 1
        
        function_code = '\n'.join(lines[start_line:end_line])
        param_count = len(node.args.args) + len(node.args.kwonlyargs)
        
        docstring = ast.get_docstring(node) or ""
        
        func_info = {
            'name': node.name,
            'file': relative_path,
            'full_path': full_path,
            'start_line': start_line + 1,
            'end_line': end_line,
            'code': function_code,
            'param_count': param_count,
            'line_count': end_line - start_line,
            'docstring': docstring
        }
        
        return func_info
    
    def extract_all_functions(self, python_files, repo_root):
        all_functions = []
        for file_path in python_files:
            functions = self.extract_functions_from_file(file_path, repo_root)
            all_functions.extend(functions)
        return all_functions
