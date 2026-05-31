# Code Smell Detection System

This project consists of two components:
1. **Model Service**: A Python/FastAPI service using CodeBERT to detect code smells
2. **CLI Tool**: A Go command-line tool to scan directories and report results

## Model Service (Python)

### Setup
```bash
cd model-service
pip install -r requirements.txt
```

### Run the Service
```bash
python main.py
```

The service will start at `http://localhost:8000`

### API Endpoints

#### POST /analyze
Analyze code for code smells.

**Request:**
```json
{
  "code": "def my_function():\n    ...",
  "language": "python"
}
```

**Response:**
```json
{
  "has_smell": true,
  "smells": [
    {
      "smell_type": "Long Method",
      "detected": true,
      "locations": [
        {
          "start_line": 1,
          "end_line": 35,
          "description": "Method 'my_function' has 35 lines (threshold: 30)"
        }
      ],
      "confidence": 0.1
    }
  ],
  "total_lines": 35
}
```

#### GET /health
Health check endpoint.

## CLI Tool (Go)

### Setup
```bash
cd cli-tool
go mod tidy
go build -o codesmell-cli
```

### Usage
```bash
# Basic usage with colored output
./codesmell-cli /path/to/directory

# Output as JSON
./codesmell-cli --json /path/to/directory

# Custom API URL
./codesmell-cli --api http://custom-host:8000/analyze /path/to/directory
```

### Options
- `--api`: Model service API URL (default: http://localhost:8000/analyze)
- `--json`: Output results in JSON format

## Supported Languages
- Python (.py)
- Java (.java)
- Go (.go)
- JavaScript (.js, .jsx)
- C/C++ (.c, .cpp, .cxx, .h, .hpp)
- C# (.cs)

## Detected Code Smells
1. **Long Method**: Methods with more than 30 lines
2. **Duplicated Code**: Similar methods detected using CodeBERT embeddings and cosine similarity
