import asyncio
import os
import fitz
from PIL import Image
from gemini_client import GeminiMathParser
import google.generativeai as genai
import tempfile
import json

async def run_hue_override_test():
    key_path = "gemini_api_key.txt"
    with open(key_path, "r", encoding="utf-8") as f:
        api_key = f.read().strip()
        
    parser = GeminiMathParser(api_key=api_key)
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\hue.pdf"
    
    # 1. Image preparation (Exact 3x3 GUI replication, NO cropping)
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
        full_img_path = tmp.name
    padded_img.save(full_img_path)
    
    sample_file = genai.upload_file(path=full_img_path)
    try:
        def my_log(msg):
            print(msg)
            
        print("[TEST] Sending FULL uncropped 3x3 hue.pdf to Phase 1 & 2...")
        sema = asyncio.Semaphore(1)
        result = await parser._extract_single_problem("1", sample_file, sema, my_log)
        
        print("\n\n===== [SUCCESS] FINAL MERGED JSON OUTPUT =====")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        print("=======================================")
        
        with open("override_test_output.json", "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
            
    except Exception as e:
        print(f"[TEST] Failed with Exception: {type(e).__name__} - {str(e)}")
    finally:
        sample_file.delete()
        os.remove(full_img_path)

if __name__ == "__main__":
    asyncio.run(run_hue_override_test())
