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
        
    print(f"Testing OCR extraction on {pdf_path} (Pure Flash - Subset [10, 12, 15, 22])")
    
    def log_progress(msg):
        print(msg)

    # Monkey patch GeminiMathParser._extract_single_problem to filter q_nums
    original_extract = GeminiMathParser._extract_single_problem
    async def patched_extract(self, q_num, img_data, extract_semaphore, log_fn):
        if q_num not in ["10", "12", "15", "22"]:
            return None
        return await original_extract(self, q_num, img_data, extract_semaphore, log_fn)
        
    GeminiMathParser._extract_single_problem = patched_extract
        
    try:
        parser = GeminiMathParser(gemini_key, "gemini-3-flash-preview", "고1(통합)")
        results = await parser.extract_math_problems(
            pdf_path,
            log_callback=log_progress,
            generate_variants=False,
            variant_difficulty="1단계"
        )
        # Filter out None values
        results = [r for r in results if r is not None]
        
        print("\n\n=== EXTRACTION RESULTS ===")
        with open("debug_subset.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print("Saved to debug_subset.json")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
