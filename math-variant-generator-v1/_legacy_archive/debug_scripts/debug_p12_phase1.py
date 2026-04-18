import asyncio
import json
import os
import fitz, base64
from PIL import Image
from io import BytesIO
from gemini_client import GeminiMathParser

async def test_e1_p12_phase1():
    key_path = "gemini_api_key.txt"
    with open(key_path, "r", encoding="utf-8") as f:
        api_key = f.read().strip()
        
    parser = GeminiMathParser(api_key=api_key)
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\e1.pdf"
    
    doc = fitz.open(pdf_path)
    page = doc[2] # 3rd page has problem 12
    mat = fitz.Matrix(4, 4)
    pix = page.get_pixmap(matrix=mat)
    mode = "RGBA" if pix.alpha else "RGB"
    img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
    if mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
        
    w, h = img.width, img.height
    img = img.crop((w//2, h//2, w, h))
        
    padding_height = 2000
    padded_img = Image.new("RGB", (img.width, img.height + padding_height), (255, 255, 255))
    padded_img.paste(img, (0, 0))
    
    import tempfile
    import google.generativeai as genai
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        padded_img_path = tmp.name
    padded_img.save(padded_img_path)
    
    sample_file = genai.upload_file(path=padded_img_path)
    
    def log_cb(msg):
        print(msg)
        
    try:
        q_num = "12"
        prompt1 = f"""당신은 문제를 절대 풀지 않는 '단순 타이피스트 기계'입니다!! 
첨부된 이미지에서 **오직 '{q_num}'번 문제 영역만** 찾으세요. 이 선명한 이미지에서 해당 문제만 완벽하게 해독하고 아래 JSON 구조로 출력하세요.
[절대 주의] 당신은 이 문제를 연산하거나 해석해서 '풀면' 안 됩니다! '수학적 대칭성(켤레복소수 등)' 같은 직관을 끄고, 오직 눈에 보이는 픽셀(가로줄, 부호)만 번역하세요!

[
  {{
    "question_num": "{q_num}",
    "pre_reading_aloud": "🚨[수식 소리내어 눈으로 쫓기]🚨 모든 수식의 분모(가로줄 아래)와 분자(가로줄 위), 부호 등을 눈으로 아주 천천히 스캔하며 '한글'로 소리내어 분석하세요. (예: 분모에는 알파만 단독으로 있고 분자에는 5베타바가 있다.)",
    "question": "문제 본문 전체 텍스트 (사전 분석한 결과를 바탕으로 정확히 [[EQUATION:...]] 태그 교체)",
    "answer_options": ["① [[EQUATION:1]]", "② [[EQUATION:2]]"]
  }}
]
""" + parser._get_core_rules()
        
        resp1 = await parser.flash_model.generate_content_async(
            [sample_file, prompt1],
            generation_config=genai.types.GenerationConfig(temperature=0.0)
        )
        text1 = parser._sanitize_json(resp1.text)
        ext1 = parser._extract_json_objects(text1)
        if ext1:
            print("\n=== PHASE 1 JSON ===")
            print(json.dumps(ext1[0], ensure_ascii=False, indent=2))
        else:
            print("Failed to parse JSON")
            print(text1)
    finally:
        sample_file.delete()
        os.remove(padded_img_path)

if __name__ == "__main__":
    asyncio.run(test_e1_p12_phase1())
