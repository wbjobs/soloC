import os
import shutil
import tempfile
from git import Repo
from pathlib import Path


class RepoScanner:
    def __init__(self, temp_dir=None):
        self.temp_dir = temp_dir or tempfile.mkdtemp()
        
    def clone_repo(self, repo_url, depth=1):
        repo_name = repo_url.split('/')[-1].replace('.git', '')
        repo_path = os.path.join(self.temp_dir, repo_name)
        
        if os.path.exists(repo_path):
            shutil.rmtree(repo_path)
            
        Repo.clone_from(repo_url, repo_path, depth=depth, single_branch=True)
        return repo_path
    
    def find_python_files(self, repo_path):
        python_files = []
        for root, dirs, files in os.walk(repo_path):
            if '.git' in dirs:
                dirs.remove('.git')
            for file in files:
                if file.endswith('.py'):
                    python_files.append(os.path.join(root, file))
        return python_files
    
    def cleanup(self):
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
