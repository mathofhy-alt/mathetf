import asyncio
import os
from gemini_client import GeminiMathParser

async def test_v12():
    api_key_path = os.path.join("dist", "gemini_api_key.txt")
    with open(api_key_path, "r", encoding="utf-8") as f:
        api_key = f.read().strip()
        
    parser = GeminiMathParser(api_key=api_key, model_name="Mocked M1")
    
    # Mocking the actual slow AI task so it returns instantly
    async def _mock_extract(q_num, img, pass1_sem, pass2_sem, pass3_sem, log_fn, fallback_img=None, is_rescue=0):
        log_fn(f"  --> [MOCKED] Extracted Q{q_num} coordinates perfectly!")
        return {"question_num": q_num, "question": "MOCK", "answer_options": [], "explanation": "MOCK"}
        
    parser._extract_single_problem = _mock_extract
    pdf_path = os.path.join("dist", "e2.pdf")
    
    print("Running V12 Pure Python Discovery on e2.pdf...")
    res = await parser.extract_math_problems(pdf_path, print)
    print(f"\nFinal extracted: {len(res)} problems.")
    for r in res:
        print(f"Q: {r['question_num']}")

if __name__ == "__main__":
    import sys
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_v12())
