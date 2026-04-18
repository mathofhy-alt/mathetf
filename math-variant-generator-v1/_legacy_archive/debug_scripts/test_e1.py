import asyncio
import json
import logging
import os
from gemini_client import GeminiMathParser

logging.basicConfig(level=logging.INFO)

async def main():
    pdf_path = "dist/e1.pdf"
    
    with open("gemini_api_key.txt", "r", encoding="utf-8") as f:
        gemini_key = f.read().strip()
        
    print(f"Testing OCR extraction on {pdf_path} (Pure Flash)")
    
    def log_progress(msg):
        print(msg)
        
    try:
        parser = GeminiMathParser(gemini_key, "gemini-3-flash-preview", "고1(통합)")
        results = await parser.extract_math_problems(
            pdf_path,
            log_callback=log_progress,
            generate_variants=False,
            variant_difficulty="1단계"
        )
        print("\n\n=== EXTRACTION RESULTS ===")
        with open("debug_e1.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print("Saved to debug_e1.json")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
