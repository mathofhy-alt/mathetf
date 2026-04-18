import asyncio
import os
import sys

# Add parent dir to path so we can import gemini_client
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from gemini_client import GeminiMathParser

async def main():
    target_pdf = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\e1.pdf"
    
    if not os.path.exists(target_pdf):
        print(f"Error: PDF not found at {target_pdf}")
        return

    # Load API Key
    with open("gemini_api_key.txt", "r", encoding="utf-8") as f:
        key = f.read().strip()
        
    parser = GeminiMathParser(key, "gemini-3-flash-preview", "고1(통합)")
    
    print(f"Testing OCR extraction on {target_pdf}")
    results = await parser.extract_math_problems(
        target_pdf, 
        log_callback=print,
        generate_variants=False,
        variant_difficulty="1단계"
    )
    
    print("\n\n=== EXTRACTION RESULTS ===")
    import json
    with open("debug_gyunggi.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    extracted_nums = [str(r.get("question_num", "")) for r in results]
    print(f"Total Extracted: {len(results)}")
    print(f"Extracted Problem Numbers: {extracted_nums}")

if __name__ == "__main__":
    asyncio.run(main())
