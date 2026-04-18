import asyncio
import sys
import json
import logging
import os
from gemini_client import GeminiMathParser

logging.basicConfig(level=logging.INFO)

async def main():
    pdf_path = "dist/경기여자고등학교_1학년_2025_1학기중간_공통수학1_공통_문제.pdf"
    print(f"Testing OCR extraction on {pdf_path}")
    
    def log_progress(msg):
        print(msg)
        
    try:
        gemini_key = open("gemini_api_key.txt", "r", encoding="utf-8").read().strip()
        parser = GeminiMathParser(gemini_key, "gemini-3-flash-preview", "고1(통합)")
        results = await parser.extract_math_problems(
            pdf_path,
            log_callback=log_progress,
            generate_variants=False,
            variant_difficulty="1단계"
        )
        print("\n\n=== EXTRACTION RESULTS ===")
        with open("debug_gyunggi.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print("Saved to debug_gyunggi.json")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
