import asyncio
import os
import fitz
from PIL import Image
from gemini_client import GeminiMathParser
import google.generativeai as genai
import tempfile
import json

async def run_hue_test():
    key_path = "gemini_api_key.txt"
    with open(key_path, "r", encoding="utf-8") as f:
        api_key = f.read().strip()
        
    parser = GeminiMathParser(api_key=api_key)
    # Using Pro model naturally since it's hardcoded in the parser
    
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\hue.pdf"
    
    # 1. Image preparation (Downscaled & cropped for local speed bypass)
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
        
    # Crop to top half for Problem 1
    cropped = img.crop((0, 0, img.width, img.height // 2))
    padded = Image.new("RGB", (cropped.width, cropped.height + 500), (255, 255, 255))
    padded.paste(cropped, (0, 0))
    
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        full_img_path = tmp.name
    padded.save(full_img_path)
    
    sample_file = genai.upload_file(path=full_img_path)
    try:
        print("[TEST] Sending cropped hue.pdf Problem 1 to Pro Core...")
        sema = asyncio.Semaphore(1)
        result = await parser._extract_single_problem("1", sample_file, sema, lambda x: print(x))
        print("\n\n===== [SUCCESS] FINAL JSON OUTPUT =====")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        print("=======================================")
        
        with open("hue_test_output.json", "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
            
    except Exception as e:
        print(f"[TEST] Failed with Exception: {type(e).__name__} - {str(e)}")
    finally:
        sample_file.delete()
        os.remove(full_img_path)

if __name__ == "__main__":
    asyncio.run(run_hue_test())
