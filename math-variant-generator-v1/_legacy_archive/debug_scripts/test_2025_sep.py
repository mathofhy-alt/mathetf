import asyncio
import os
import json
from gemini_client import GeminiMathParser
from hml_generator import HMLGenerator

async def main():
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\모의고사\2025\9월\2025_고3_9월_0공통.pdf"
    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}")
        return

    # User's GOOGLE_API_KEY from gemini_api_key.txt
    api_key = ""
    if os.path.exists("gemini_api_key.txt"):
        with open("gemini_api_key.txt", "r", encoding="utf-8") as f:
            api_key = f.read().strip()
    if not api_key:
        print("API Key not found in gemini_api_key.txt.")
        return

    parser = GeminiMathParser(
        api_key=api_key,
        model_name="하이브리드 (Phase 1: Flash 추출, Phase 2: Pro 교정) - 권장",
        curriculum="고1 수준 (공통수학)"
    )

    def log_cb(msg):
        print(msg)

    print(f"Starting extraction for {pdf_path}...")
    problems = await parser.extract_math_problems(
        pdf_path=pdf_path,
        log_callback=log_cb,
        generate_variants=False
    )
    
    print(f"\nExtracted {len(problems)} problems.")
    
    with open("debug_2025_sep_problems.json", "w", encoding="utf-8") as f:
        json.dump(problems, f, ensure_ascii=False, indent=2)
        
    if problems:
        print("Checking Problem 3 and Problem 20...")
        for p in problems:
            qnum = p.get('question_num')
            if qnum in ['3', '20']:
                print(f"--- Q{qnum} ---")
                print(p.get('question')[:200] + "...")
                print("----------------")
                
        hml_gen = HMLGenerator()
        hml_content = hml_gen.generate_hml_for_all(problems)
        with open("2025_고3_9월_0공통_output.hml", "w", encoding="utf-8") as f:
            f.write(hml_content)
        print("HML generated successfully.")

if __name__ == "__main__":
    asyncio.run(main())
