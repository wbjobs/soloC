import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max upload
    ALLOWED_EXTENSIONS = {'fa', 'fasta', 'fas'}
    BLAST_DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'blast_db')
    BLAST_RESULTS_PATH = os.path.join(os.path.dirname(__file__), '..', 'blast_results')
