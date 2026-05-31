#!/usr/bin/env python3
import requests
import os
import sys

def test_analyze_endpoint():
    url = "http://localhost:8000/analyze"
    
    test_data_dir = "test_data"
    if not os.path.exists(test_data_dir):
        print(f"Test data directory not found. Generating test data...")
        import subprocess
        subprocess.run([sys.executable, "test_data/generate_test_data.py"], cwd=os.getcwd())
    
    files = {
        'gff1': open('test_data/species1.gff3', 'rb'),
        'gff2': open('test_data/species2.gff3', 'rb'),
        'blast': open('test_data/blast_results.txt', 'rb')
    }
    
    print("Sending request to /analyze endpoint...")
    
    try:
        response = requests.post(url, files=files, timeout=120)
        
        print(f"Status code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("\n=== Analysis Summary ===")
            for key, value in result['summary'].items():
                print(f"{key}: {value}")
            
            print(f"\nFound {len(result['syntenic_blocks'])} syntenic blocks")
            print(f"Found {len(result['ancestral_contigs'])} ancestral contigs")
            
            print("\n=== Visualizations Generated ===")
            for viz_name in result['visualizations'].keys():
                print(f"- {viz_name}")
            
            if 'pdf_report' in result:
                print(f"\nPDF report generated (size: {len(result['pdf_report'])} chars)")
            
            print("\n✅ Test passed!")
            return True
        else:
            print(f"Error: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Connection refused. Make sure the server is running on port 8000.")
        print("Start the server with: python main.py")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    finally:
        for f in files.values():
            f.close()

if __name__ == "__main__":
    test_analyze_endpoint()
