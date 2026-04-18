import asyncio
import json
import os
import fitz, base64
from PIL import Image
from io import BytesIO
from gemini_client import GeminiMathParser

async def test_e1_p12():
    key_path = "gemini_api_key.txt"
    with open(key_path, "r", encoding="utf-8") as f:
        api_key = f.read().strip()
        
    parser = GeminiMathParser(api_key=api_key)
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\e1.pdf"
    
    # Render pdf
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
        
    # Crop bottom right loosely where problem 12 is
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
        
    extract_semaphore = asyncio.Semaphore(1)
    
    try:
        res = await parser._extract_single_problem("12", sample_file, extract_semaphore, log_cb)
        out_path = "debug_e1_p12_doublepro.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=2)
            
        print(f"\nSaved Problem 12 to {out_path}")
        print("Question Eq:")
        print(res.get('question'))
        print("Explanation Eq:")
        print(res.get('explanation'))
    finally:
        sample_file.delete()
        os.remove(padded_img_path)

if __name__ == "__main__":
    asyncio.run(test_e1_p12())
