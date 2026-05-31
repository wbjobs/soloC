from repo_scanner import RepoScanner
from function_extractor import FunctionExtractor
from embedding_generator import EmbeddingGenerator
from chroma_index import ChromaIndex


class CodeSmellService:
    def __init__(self, use_local_embeddings=True):
        self.scanner = RepoScanner()
        self.extractor = FunctionExtractor()
        self.embedding_generator = EmbeddingGenerator(use_local=use_local_embeddings)
        self.index = ChromaIndex()
        
    def process_repo(self, repo_url):
        try:
            repo_path = self.scanner.clone_repo(repo_url)
            python_files = self.scanner.find_python_files(repo_path)
            
            functions = self.extractor.extract_all_functions(python_files, repo_path)
            
            if not functions:
                return 0, "No Python functions found"
            
            codes = [f['code'] for f in functions]
            embeddings = self.embedding_generator.generate_embeddings_batch(codes)
            
            self.index.clear_collection()
            count = self.index.index_functions(functions, embeddings)
            
            return count, f"Successfully indexed {count} functions"
            
        except Exception as e:
            return 0, f"Error processing repo: {str(e)}"
        finally:
            self.scanner.cleanup()
    
    def search_smells(self, smell_description, n_results=5):
        query_embedding = self.embedding_generator.generate_embedding(smell_description)
        results = self.index.search_similar(query_embedding, n_results)
        return results
    
    def get_indexed_count(self):
        return self.index.get_count()
