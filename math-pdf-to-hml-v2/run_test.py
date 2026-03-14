import sys
import asyncio
import json

sys.path.append("..")
from openai_client import OpenAIMathParser

async def test_extraction():
    with open('openai_api_key.txt', 'r') as f:
        api_key = f.read().strip()
    
    print("Testing OpenAI Extractor on '테스트.pdf' with 'gpt5.2'...")
    parser = OpenAIMathParser(api_key=api_key, model_name="gpt5.2")
    
    def log_handler(msg): print(msg)
        
    results = await parser.extract_math_problems('../pdf모음/테스트.pdf', log_callback=log_handler)
    
    with open('test_output.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        
    print(f"\nFinished. Extracted {len(results)} problems. Saved to 'test_output.json'")

if __name__ == "__main__":
    asyncio.run(test_extraction())
