import asyncio
import os
import sys

sys.path.append('.')
from gemini_client import GeminiMathParser

async def test():
    try:
        with open('gemini_api_key.txt', 'r') as f:
            api_key = f.read().strip()
    except FileNotFoundError:
        print("gemini_api_key.txt not found.")
        return

    if not api_key:
        print("GEMINI_API_KEY is not set.")
        return
    
    pdf_path = r"dist\테스트.pdf"
    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}")
        return

    parser = GeminiMathParser(api_key, model_name='gemini-3.1-pro-preview', curriculum="고1 수준 (공통수학)")
    
    print("Starting extraction...")
    problems = await parser.extract_math_problems(pdf_path)
    
    print(f"\nExtracted {len(problems)} problems.")

if __name__ == '__main__':
    asyncio.run(test())
