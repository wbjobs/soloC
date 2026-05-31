import urllib.request
import json

try:
    with urllib.request.urlopen("http://localhost:8000/") as response:
        data = response.read().decode("utf-8")
        print("API Response:")
        print(json.dumps(json.loads(data), indent=2, ensure_ascii=False))
except Exception as e:
    print(f"Error: {e}")
