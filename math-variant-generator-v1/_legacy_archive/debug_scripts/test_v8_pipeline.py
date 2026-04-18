import asyncio
from gemini_client import GeminiMathParser

def noop_log(msg):
    print(msg)

async def test_pipeline():
    print("=== [테스트] 5x5 크롭 파이프라인 수식 테스트 ===\n")
    with open("gemini_api_key.txt", "r", encoding="utf-8") as f:
        api_key = f.read().strip()
        
    client = GeminiMathParser(
        api_key=api_key,
        curriculum="고등학교 수학(선택과목)",
    )
    
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\hue.pdf"
    
    # Run the core extraction directly
    results = await client.extract_math_problems(pdf_path, noop_log)
    
    with open("final_hwpx_payload.json", "w", encoding="utf-8") as f:
        import json
        json.dump(results, f, ensure_ascii=False, indent=2)
    print("Done. Saved to final_hwpx_payload.json")

if __name__ == "__main__":
    asyncio.run(test_pipeline())
