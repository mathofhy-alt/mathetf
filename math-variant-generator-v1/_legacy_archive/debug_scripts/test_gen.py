import asyncio
import os
import sys

from gemini_client import GeminiMathParser

async def test():
    try:
        with open("gemini_api_key.txt", "r", encoding="utf-8") as f:
            api_key = f.read().strip()
    except Exception:
        print("API Key not found")
        return
        
    parser = GeminiMathParser(api_key=api_key, model_name="대안 2: Mathpix(OCR) + Gemini Pro(해설) - 무결점/유료")
    import google.generativeai as genai
    prompt = """[원본 해설 + 변형문제 생성 전담 모드]
아래 원본 수학 문제에 대해 다음 두 가지를 한 번에 수행하세요:
1) 원본 문제의 해설 작성
2) 변형문제 3개 + 각 해설 작성

[원본 문제 (제 1번)]
이차방정식 x^2 - 4x + 3 = 0 의 해를 구하시오.

[응답 형식]
총 4개 항목을 JSON 배열로 반환하세요.
- 첫 번째 항목 (원본 해설):
  - question_num: "1"
  - question: 원본 문제 본문 그대로
  - answer_options: 원본 보기 그대로
  - explanation: 원본 문제 해설

- 두~네 번째 항목 (변형문제):
  - question_num: "1-변형1", "1-변형2", "1-변형3"
  - question: 변형된 문제 본문
  - answer_options: 보기 배열 (객관식이면 5개, 단답형이면 빈 배열 [])
  - explanation: 변형문제 해설
"""
    try:
        resp = await parser.model.generate_content_async(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.65,
                max_output_tokens=16384,
            )
        )
        print("RAW RESP TEXT:")
        val = resp.text
        print(val)
    except Exception as e:
        print("Exception during generation:", e)

if __name__ == '__main__':
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test())
