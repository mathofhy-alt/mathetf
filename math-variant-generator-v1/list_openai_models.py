import os
import json
import urllib.request
import urllib.error

def list_openai_models():
    api_key_path = "openai_api_key.txt"
    if not os.path.exists(api_key_path):
        print("Error: openai_api_key.txt not found.")
        return
        
    with open(api_key_path, "r") as f:
        api_key = f.read().strip()
        
    url = "https://api.openai.com/v1/models"
    headers = {
        "Authorization": f"Bearer {api_key}"
    }
    
    req = urllib.request.Request(url, headers=headers, method="GET")
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            models = [model['id'] for model in data.get('data', [])]
            
            # Filter to show only relevant models (GPT and o series)
            relevant_models = [m for m in models if m.startswith('gpt-') or m.startswith('o')]
            relevant_models.sort()
            
            print("=== Available OpenAI Models ===")
            for m in relevant_models:
                print(m)
                
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8')
        print(f"HTTP Error {e.code}: {err_msg}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_openai_models()
