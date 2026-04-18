import asyncio
import os
import sys
import base64
from PIL import Image
import fitz  # PyMuPDF

# Ensure we can import from current directory
sys.path.append(os.getcwd())
import google.generativeai as genai

async def test_hwp_direct():
    # Load API Key
    key_path = '.api_key_gemini'
    if not os.path.exists(key_path):
        key_path = 'gemini_api_key.txt'
    with open(key_path, 'r', encoding='utf-8') as f:
        api_key = f.read().strip()

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-3-flash-preview')

    # Prepare image from PDF (Page 1)
    pdf_path = os.path.join(os.getcwd(), 'dist', 'fracex1.pdf')
    doc = fitz.open(pdf_path)
    page = doc[0]
    pix = page.get_pixmap(matrix=fitz.Matrix(2,2))
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    
    img_path = "test_page.png"
    img.save(img_path)

    # Upload file
    sample_file = genai.upload_file(path=img_path)

    prompt = """첨부된 이미지의 12번 문제를 한글 수식 편집기(HWP Math)에 바로 복사해서 붙여넣을 수 있는 수식 문자열로 추출해줘.
예를 들어 분수는 {a} over {b}, 켤레복소수는 bar {alpha} 같은 형태로 작성해줘. 
오직 수식 문자열만 대답해줘."""

    print("--- Sending Request to Gemini 3.1 Flash Preview ---")
    try:
        response = await model.generate_content_async(
            [sample_file, prompt],
            request_options={"timeout": 600}
        )
        print("--- Gemini Response ---")
        print(response.text)
        print("-----------------------")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        sample_file.delete()
        if os.path.exists(img_path):
            os.remove(img_path)

if __name__ == "__main__":
    asyncio.run(test_hwp_direct())
