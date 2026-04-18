import asyncio
from gemini_client import GeminiMathParser
import json

async def main():
    api_key = "AIzaSyDvlzRyfxFJ76h6pVddExvp3TKSe1hp57M"
    pdf_path = "dist/tem.pdf"
    
    print(f"Starting async test on {pdf_path}...")
    parser = GeminiMathParser(api_key)
    
    problems = await parser.extract_math_problems(pdf_path, log_callback=lambda x: None)
    
    print(f"\n✅ Total extracted: {len(problems)}")
    
    for i, p in enumerate(problems):
        print(f"\n--- Problem {i+1} ---")
        print(f"[{p.get('question_num')}] Keys: {list(p.keys())}")
        print(f"Q: {p.get('question')[:50]}...")
        if p.get('answer_options'):
            print(f"A: {p.get('answer_options')}")
        print(f"E: {p.get('explanation')[:50]}...")

if __name__ == "__main__":
    asyncio.run(main())
