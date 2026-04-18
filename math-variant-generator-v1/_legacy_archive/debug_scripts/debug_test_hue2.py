import asyncio
import json
from gemini_client import GeminiMathParser
import fitz, base64
from PIL import Image
from io import BytesIO

async def main():
    key_path = "gemini_api_key.txt"
    with open(key_path, "r", encoding="utf-8") as f:
        api_key = f.read().strip()
        
    parser = GeminiMathParser(api_key=api_key)
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\hue.pdf"
    
    # 4배율 렌더링 (동일 조건)
    doc = fitz.open(pdf_path)
    page = doc[0]
    mat = fitz.Matrix(4, 4)
    pix = page.get_pixmap(matrix=mat)
    mode = "RGBA" if pix.alpha else "RGB"
    img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
    if mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
        
    padding_height = 2000
    padded_img = Image.new("RGB", (img.width, img.height + padding_height), (255, 255, 255))
    padded_img.paste(img, (0, 0))
    
    buffer = BytesIO()
    padded_img.save(buffer, format="PNG")
    b64_img = base64.b64encode(buffer.getvalue()).decode("utf-8")
    
    extract_semaphore = asyncio.Semaphore(1)
    
    def log_cb(msg):
        print(msg)
        
    print("Extracting Problem 2 Phase 1 + 2 directly...")
    
    import google.generativeai as genai
    import tempfile, os
    
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        padded_img_path = tmp.name
    padded_img.save(padded_img_path)
    
    sample_file = genai.upload_file(path=padded_img_path)
    
    try:
        res = await parser._extract_single_problem("2", sample_file, extract_semaphore, log_cb)
        
        print("\n\n=== PROBLEM 2 OUTPUT ===")
        print(json.dumps(res, ensure_ascii=False, indent=2))
        
        out_path = "debug_hue_output.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump([res], f, ensure_ascii=False, indent=2)
    finally:
        sample_file.delete()
        os.remove(padded_img_path)
        
if __name__ == "__main__":
    asyncio.run(main())
