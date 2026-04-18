import asyncio
import os
import sys

# Ensure correct path for imports
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from gemini_client import GeminiMathParser

async def run_test():
    try:
        with open("gemini_api_key.txt", "r", encoding="utf-8") as f:
            gemini_key = f.read().strip()
    except FileNotFoundError as e:
        print(f"Key file missing: {e}")
        return

    pdf_path = os.path.join("dist", "e1.pdf")
    if not os.path.exists(pdf_path):
        print(f"PDF not found at {pdf_path}")
        return

    print("====================================")
    print("🚀 [V10] e1.pdf Hybrid + Structured Outputs 테스트 (Pro Multi-Lane)")
    print("====================================")
    parser = GeminiMathParser(
        api_key=gemini_key,
        model_name="하이브리드 (Discovery: Flash, 추출/해설: One-Pass Pro) - 권장",
        curriculum="고1 수준 (공통수학)"
    )

    def log_cb(msg):
        print(msg)

    problems = await parser.extract_math_problems(pdf_path, log_callback=log_cb)
    
    print("\n\n====================================")
    print(f"🎉 추출 최종 완료 (총 {len(problems)} 문제)")
    print("====================================")
    for p in problems:
        print(f"\n[문제 번호 {p.get('question_num')}]")
        print(f"Q (본문): {str(p.get('question', ''))[:80]}...")
        if p.get('thought_process'):
            print(f"T (연습장): {str(p.get('thought_process', ''))[:80]}...")
        if p.get('explanation'):
            print(f"E (해설): {str(p.get('explanation', ''))[:80]}...")
        print("-" * 50)

if __name__ == "__main__":
    asyncio.run(run_test())
