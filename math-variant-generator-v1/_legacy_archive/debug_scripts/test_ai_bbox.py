import asyncio
import google.generativeai as genai
import tempfile
import ast
import fitz
import os
from PIL import Image

async def test_ai_bbox():
    print("=== [디버그] AI 공간 좌표 추출 프롬프트 테스트 ===\n")
    with open("gemini_api_key.txt", "r", encoding="utf-8") as f:
        api_key = f.read().strip()
    genai.configure(api_key=api_key)
    
    # Discovery Phase에서는 속도와 공간지각능력이 빠른 Flash 모델이 유리함
    model = genai.GenerativeModel('gemini-3.1-pro-preview')
    
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\hue.pdf"
    doc = fitz.open(pdf_path)
    page = doc[0]
    
    # 5x5 고해상도 전체 페이지 (램 캐싱용)
    mat = fitz.Matrix(5, 5)
    pix = page.get_pixmap(matrix=mat)
    mode = "RGBA" if pix.alpha else "RGB"
    full_img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
    if mode == "RGBA":
        bg = Image.new("RGB", full_img.size, (255, 255, 255))
        bg.paste(full_img, mask=full_img.split()[3])
        full_img = bg
        
    print(f"> 5x5 이미지 메모리 로딩 완료: {full_img.size}")
    
    # 2x2 썸네일 생성 (API 전송 속도용). Discovery는 글자 모양이 아니라 전체적인 레이아웃만 보면 됨.
    thumb_mat = fitz.Matrix(2, 2)
    thumb_pix = page.get_pixmap(matrix=thumb_mat)
    thumb_mode = "RGBA" if thumb_pix.alpha else "RGB"
    thumb_img = Image.frombytes(thumb_mode, [thumb_pix.width, thumb_pix.height], thumb_pix.samples)
    if thumb_mode == "RGBA":
        bg = Image.new("RGB", thumb_img.size, (255, 255, 255))
        bg.paste(thumb_img, mask=thumb_img.split()[3])
        thumb_img = bg
        
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        thumb_path = tmp.name
    thumb_img.save(thumb_path)
    
    print("> Discovery 썸네일 업로드 중...")
    sample_file = genai.upload_file(path=thumb_path)
    
    discovery_prompt = """시험지 이미지 전체를 스캔하여 모든 '메인 문제 번호'와 해당 문제가 차지하는 대략적인 Y축 좌표 범위(start_y, end_y)를 찾아주세요.
y축 좌표는 0.0 (맨 위) ~ 1.0 (맨 아래) 사이의 비율입니다. 
다음 문제가 시작하기 직전까지의 여백을 모두 포함하여 영역을 넓게 잡으세요.

오직 아래 JSON 배열 구문으로만 응답하세요.
[
  {"q_num": "1", "start_y": 0.0, "end_y": 0.35},
  {"q_num": "2", "start_y": 0.35, "end_y": 1.0}
]"""

    try:
        resp = await model.generate_content_async(
            [sample_file, discovery_prompt],
            generation_config=genai.types.GenerationConfig(temperature=0.0)
        )
        print("======== [🚨 Discovery RAW 아웃풋 🚨] ========\n")
        print(resp.text)
        print("\n============================================\n")
        
    except Exception as e:
        print(e)
    finally:
        sample_file.delete()
        os.remove(thumb_path)

if __name__ == "__main__":
    asyncio.run(test_ai_bbox())
