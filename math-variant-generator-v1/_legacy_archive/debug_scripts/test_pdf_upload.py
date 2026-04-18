import asyncio
import os
import google.generativeai as genai
from gemini_client import GeminiMathParser
import json

async def run_pdf_upload():
    print("=== [디버그] 순수 PDF 벡터 업로드 테스트 ===\n")
    try:
        with open("gemini_api_key.txt", "r", encoding="utf-8") as f:
            api_key = f.read().strip()
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-3.1-pro-preview')
        parser = GeminiMathParser(api_key=api_key)
        
        pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\hue.pdf"
        
        print("> 1. 원본 PDF 파일 자체를 업로드 중...")
        sample_file = genai.upload_file(path=pdf_path)
        
        q_num = "1"
        prompt1 = f"""당신은 문제를 절대 풀지 않는 '단순 타이피스트 기계'입니다!! 
첨부된 원본 PDF 파일에서 **오직 '{q_num}'번 문제 영역만** 찾으세요. 해당 문제만 완벽하게 해독하고 아래 JSON 구조로 출력하세요.
[절대 주의 1] 당신은 이 문제를 연산하거나 해석해서 '풀면' 안 됩니다! '수학적 대칭성(켤레복소수 등)' 같은 직관을 끄고, 오직 눈에 보이는 PDF 벡터(가로줄, 부호)만 번역하세요!
[절대 주의 2] 🚨 분수 형태의 수식에서 분모나 분자에 있는 켤레복소수 기호(바, bar)를 분수 선과 헷갈려 누락하는 경우가 많으니, 기호가 빠지지 않았는지 아주 꼼꼼히 확인해! 얇은 가로줄이 있다면 무조건 `bar` 기호로 살려내야 합니다!

[
  {{
    "question_num": "{q_num}",
    "pre_reading_aloud": "🚨[수식 극정밀 스캔]🚨 분모와 분자의 가로줄 위/아래에 켤레복소수 bar 필셀이 아주 미세하게라도 찍혀있는지 현미경처럼 관찰하세요. (예: 분자에 5 beta bar 가 있고, 분모에는 bar 가 전혀 없이 순수하게 alpha 만 있다. 픽셀 그대로 적자.)",
    "question": "문제 본문 전체 텍스트 (사전 분석한 결과를 바탕으로 정확히 [[EQUATION:...]] 태그 교체)",
    "answer_options": ["① [[EQUATION:1]]", "② [[EQUATION:2]]"]
  }}
]
""" + parser._get_core_rules()

        print("> 2. Gemini 3.1 Pro (Native PDF OCR) 응답 대기 중...\n")
        resp1 = await model.generate_content_async(
            [sample_file, prompt1],
            generation_config=genai.types.GenerationConfig(temperature=0.0)
        )
        
        print("======== [🚨 PDF RAW 아웃풋 🚨] ========\n")
        print(resp1.text)
        print("\n==================================================\n")
        
    except Exception as e:
        print(f"오류: {e}")
    finally:
        try:
            sample_file.delete()
        except: pass

if __name__ == "__main__":
    asyncio.run(run_pdf_upload())
