import os
import json
import urllib.request
import asyncio

async def test_endpoint():
    api_key_path = "openai_api_key.txt"
    with open(api_key_path, "r") as f:
        api_key = f.read().strip()
        
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    
    data = {
        "model": "gpt-5.4-pro",
        "messages": [
            {
                "role": "user",
                "content": "Hello"
            }
        ],
        "max_completion_tokens": 10
    }
    
    json_data = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=json_data, headers=headers, method="POST")
    
    try:
        with urllib.request.urlopen(req) as response:
            resp = json.loads(response.read().decode('utf-8'))
            print("Chat Completion Success!")
            print(resp['choices'][0]['message']['content'])
    except Exception as e:
        print("Chat Completion Failed:", e)
        if hasattr(e, 'read'):
            print(e.read().decode('utf-8'))

if __name__ == "__main__":
    asyncio.run(test_endpoint())
