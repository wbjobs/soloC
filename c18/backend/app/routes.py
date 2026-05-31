import os
from flask import Blueprint, jsonify, request
from flask_graphql import GraphQLView
from graphene_file_upload.flask import FileUploadGraphQLView
from .schema import schema
from . import create_app

main = Blueprint('main', __name__)

app = create_app()

app.add_url_rule(
    '/graphql',
    view_func=FileUploadGraphQLView.as_view(
        'graphql',
        schema=schema,
        graphiql=True,
    )
)

@main.route('/health')
def health_check():
    return jsonify({'status': 'healthy', 'service': 'Gene Sequence Analysis Platform'})

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(app.config['BLAST_DB_PATH'], exist_ok=True)
    os.makedirs(app.config['BLAST_RESULTS_PATH'], exist_ok=True)
    app.run(debug=True, host='0.0.0.0', port=5000)
