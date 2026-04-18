import asyncio
import json
import os
from gemini_client import GeminiMathParser

async def test_hue():
    key_path = "gemini_api_key.txt"
    if not os.path.exists(key_path):
        print("API Key completely missing!")
        return
        
    with open(key_path, "r", encoding="utf-8") as f:
        api_key = f.read().strip()
        
    parser = GeminiMathParser(api_key=api_key)
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\hue.pdf"
    
    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}")
        return
        
    print("Starting Double-Pro Two-Pass extraction on hue.pdf...")
    
    def log_cb(msg):
        print(msg)
        
    results = await parser.extract_math_problems(pdf_path, log_callback=log_cb)
    
    out_path = "debug_hue_output.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        
    print(f"\nExtraction complete. Saved to {out_path}")
    print(f"Total problems extracted: {len(results)}")

if __name__ == "__main__":
    asyncio.run(test_hue())
