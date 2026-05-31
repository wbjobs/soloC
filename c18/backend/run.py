import os
from app import create_app

app = create_app()

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(app.config['BLAST_DB_PATH'], exist_ok=True)
    os.makedirs(app.config['BLAST_RESULTS_PATH'], exist_ok=True)
    app.run(debug=True, host='0.0.0.0', port=5000)
