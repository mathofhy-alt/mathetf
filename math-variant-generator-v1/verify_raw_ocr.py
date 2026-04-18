import asyncio
import os
import fitz
from PIL import Image
import google.generativeai as genai
import tempfile
import json
from gemini_client import GeminiMathParser

async def run_raw_gemini():
    print("=== [디버그] 순수 Gemini OCR 원본 검증 스크립트 ===\n")
    try:
        with open("gemini_api_key.txt", "r", encoding="utf-8") as f:
            api_key = f.read().strip()
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-3.1-pro-preview')
        parser = GeminiMathParser(api_key=api_key) # For loading rules
        
        pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\hue.pdf"
        print("> 1. hue.pdf 3x3 해상도 렌더링 중...")
        doc = fitz.open(pdf_path)
        page = doc[0]
        mat = fitz.Matrix(3, 3)
        pix = page.get_pixmap(matrix=mat)
        mode = "RGBA" if pix.alpha else "RGB"
        img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
        if mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
            
        padding_height = 500
        padded_img = Image.new("RGB", (img.width, img.height + padding_height), (255, 255, 255))
        padded_img.paste(img, (0, 0))
        
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            padded_img_path = tmp.name
        padded_img.save(padded_img_path)
        
        print("> 2. 파일 업로드 중...")
        sample_file = genai.upload_file(path=padded_img_path)
        
        # Phase 1 가장 멍청한 프롬프트 (방금 복구한 버전) 그대로 적용
        q_num = "1"
        prompt1 = f"""당신은 문제를 절대 풀지 않는 '단순 타이피스트 기계'입니다!! 
첨부된 이미지에서 **오직 '{q_num}'번 문제 영역만** 찾으세요. 이 선명한 이미지에서 해당 문제만 완벽하게 해독하고 아래 JSON 구조로 출력하세요.
[절대 주의 1] 당신은 이 문제를 연산하거나 해석해서 '풀면' 안 됩니다! '수학적 대칭성(켤레복소수 등)' 같은 직관을 끄고, 오직 눈에 보이는 픽셀(가로줄, 부호)만 번역하세요!
[절대 주의 2] 🚨 분수나 문자 위/아래에 아주 얇고 희미하게 그어진 가로줄(bar) 픽셀이 하나라도 있는지 현미경처럼 스캔하세요. 인간의 눈에 안 보일 정도로 얇아도 이미지에 가로줄 픽셀이 있다면 무조건 `bar` 기호로 살려내야 합니다! 반대로 줄이 없으면 절대 `bar`를 붙이지 마세요! 창조 금지!

[
  {{
    "question_num": "{q_num}",
    "pre_reading_aloud": "🚨[수식 극정밀 스캔]🚨 분모와 분자의 가로줄 위/아래에 켤레복소수 bar 필셀이 아주 미세하게라도 찍혀있는지 현미경처럼 관찰하세요. (예: 분자에 5 beta bar 가 있고, 분모에는 bar 가 전혀 없이 순수하게 alpha 만 있다. 픽셀 그대로 적자.)",
    "question": "문제 본문 전체 텍스트 (사전 분석한 결과를 바탕으로 정확히 [[EQUATION:...]] 태그 교체)",
    "answer_options": ["① [[EQUATION:1]]", "② [[EQUATION:2]]"]
  }}
]
""" + parser._get_core_rules()

        print("> 3. Gemini 3.1 Pro (Phase 1 Typist) 응답 대기 중...\n")
        resp1 = await model.generate_content_async(
            [sample_file, prompt1],
            generation_config=genai.types.GenerationConfig(temperature=0.0)
        )
        
        print("======== [🚨 여기가 제미나이의 포장 뜯기 전 날것 RAW 텍스트 🚨] ========\n")
        print(resp1.text)
        print("\n==========================================================================\n")
        
        with open("RAW_GEMINI_OUTPUT.txt", "w", encoding="utf-8") as f:
            f.write("=== [🚨 제미나이 언어모델 완전 생(RAW) 출력 텍스트 🚨] ===\n\n")
            f.write(resp1.text)
        print("> 바탕화면에 'RAW_GEMINI_OUTPUT.txt' 파일을 생성했습니다! 메모장으로 여시면 똑같은 내용을 직접 확인 가능합니다.")
        
    except Exception as e:
        print(f"오류: {e}")
    finally:
        try:
            sample_file.delete()
            os.remove(padded_img_path)
        except: pass

if __name__ == "__main__":
    asyncio.run(run_raw_gemini())
