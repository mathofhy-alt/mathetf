import asyncio
import os
import fitz
from PIL import Image
from gemini_client import GeminiMathParser

async def describe_p1():
    key_path = "gemini_api_key.txt"
    with open(key_path, "r", encoding="utf-8") as f:
        api_key = f.read().strip()
        
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\hue.pdf"
    
    doc = fitz.open(pdf_path)
    page = doc[0]
    mat = fitz.Matrix(2, 2)
    pix = page.get_pixmap(matrix=mat)
    mode = "RGBA" if pix.alpha else "RGB"
    img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
    if mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
        
    import tempfile
    import google.generativeai as genai
    genai.configure(api_key=api_key)
    
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        full_img_path = tmp.name
    img.save(full_img_path)
    
    sample_file = genai.upload_file(path=full_img_path)
    try:
        model = genai.GenerativeModel("gemini-3-flash-preview")
        print("Asking Flash to describe Problem 1...")
        resp = model.generate_content(
            [sample_file, "이 시험지의 '1번' 문항이 어떤 유형의 문제인지 한국어로 아주 짧게 1~2줄로 요약해주세요. (예: 어떤 기호가 쓰였나? 극한? 미적분? 도형이나 그래프가 포함되어 있나?)"]
        )
        print("\n--- Problem 1 Description ---")
        print(resp.text)
    finally:
        sample_file.delete()
        os.remove(full_img_path)

if __name__ == "__main__":
    asyncio.run(describe_p1())
