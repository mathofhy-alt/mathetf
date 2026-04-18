import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from gemini_client import GeminiMathParser

async def run_test():
    try:
        # Read API keys from the dist directory where the exe saves them
        with open(os.path.join("dist", "gemini_api_key.txt"), "r", encoding="utf-8") as f:
            gemini_key = f.read().strip()
        with open(os.path.join("dist", "mathpix_app_id.txt"), "r", encoding="utf-8") as f:
            m_id = f.read().strip()
        with open(os.path.join("dist", "mathpix_app_key.txt"), "r", encoding="utf-8") as f:
            m_key = f.read().strip()
    except FileNotFoundError as e:
        print(f"Key file missing: {e}")
        return

    pdf_path = os.path.join("dist", "e1.pdf")
    if not os.path.exists(pdf_path):
        print(f"PDF not found at {pdf_path}")
        return

    print("====================================")
    print("🚀 [V11] e1.pdf Math-PDF-to-HML AST Engine & Recursive Pass2")
    print("====================================")
    parser = GeminiMathParser(
        api_key=gemini_key,
        model_name="대안 2: Mathpix(OCR) + Gemini Flash(해설) - 무결점/초고속",
        curriculum="고1 수준 (공통수학)",
        mathpix_app_id=m_id,
        mathpix_app_key=m_key
    )

    def log_cb(msg):
        print(msg)

    problems = await parser.extract_math_problems(pdf_path, log_callback=log_cb)
    
    print("\n\n====================================")
    print(f"🎉 V10.1 추출 최종 완료 (총 {len(problems)} 문제)")
    print("====================================")
    for p in problems:
        print(f"\n[문제 번호 {p.get('question_num')}]")
        print(f"Q (본문/Pass1): {str(p.get('question', ''))[:80]}...")
        if p.get('thought_process'):
            print(f"T (연습장/Pass2): {str(p.get('thought_process', ''))[:80]}...")
        if p.get('explanation'):
            print(f"E (해설/Pass2): {str(p.get('explanation', ''))[:80]}...")
        print("-" * 50)

    import json
    with open("debug_e1_v10.1.json", "w", encoding="utf-8") as f:
        json.dump(problems, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    asyncio.run(run_test())
