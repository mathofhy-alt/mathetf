import asyncio
import json
import logging
import os
from gemini_client import GeminiMathParser
from hml_generator import HMLGenerator

logging.basicConfig(level=logging.INFO)

async def main():
    pdf_path = "dist/e1.pdf"
    
    with open("gemini_api_key.txt", "r", encoding="utf-8") as f:
        gemini_key = f.read().strip()
        
    print(f"Testing OCR extraction on {pdf_path} (Hybrid Mode)")
    
    def log_progress(msg):
        print(msg)
        
    try:
        model_name = "하이브리드 (Phase 1: Flash 추출, Phase 2: Pro 교정) - 권장"
        parser = GeminiMathParser(gemini_key, model_name, "고1 수준 (공통수학)")
        results = await parser.extract_math_problems(
            pdf_path,
            log_callback=log_progress,
            generate_variants=False,
            variant_difficulty="1단계: 하 (단순 숫자/기호 변형 - 빠르고 안전함)"
        )
        print(f"\n\n=== EXTRACTION RESULTS ({len(results)} problems) ===")
        with open("debug_e1_hybrid.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print("Saved to debug_e1_hybrid.json")

        generator = HMLGenerator()
        for i, prob in enumerate(results, 1):
            generator.add_problem(prob, i)
        
        output_path = "dist/e1_hybrid.hml"
        generator.save(output_path)
        print(f"Saved to {output_path}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
