import asyncio
import json
from gemini_client import GeminiMathParser

async def run_hue_full():
    key_path = "gemini_api_key.txt"
    with open(key_path, "r", encoding="utf-8") as f:
        api_key = f.read().strip()
        
    parser = GeminiMathParser(api_key=api_key)
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\hue.pdf"
    
    # We will FORCE the model to `gemini-3-flash-preview` to prevent Pro from timing out and taking forever on Problem 1
    import google.generativeai as genai
    parser.model = genai.GenerativeModel("gemini-3-flash-preview")
    parser.flash_model = genai.GenerativeModel("gemini-3-flash-preview")
    parser.pro_model = genai.GenerativeModel("gemini-3-flash-preview")
    
    def log_cb(msg):
        print(msg)
        
    print(f"Running full V8 extraction pipeline on {pdf_path} (Forced Flash)...")
    results = await parser.extract_math_problems(pdf_path, log_callback=log_cb)
    
    out_path = "test_hue_full.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        
    print(f"Done! Dumped to {out_path}")

if __name__ == "__main__":
    asyncio.run(run_hue_full())
