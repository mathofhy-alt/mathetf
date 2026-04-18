import asyncio
import os
import fitz
from PIL import Image
from gemini_client import GeminiMathParser

async def check_crop():
    key_path = "gemini_api_key.txt"
    with open(key_path, "r", encoding="utf-8") as f:
        api_key = f.read().strip()
        
    parser = GeminiMathParser(api_key=api_key)
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\hue.pdf"
    
    doc = fitz.open(pdf_path)
    page = doc[0] # hue.pdf page 1
    
    mat = fitz.Matrix(4, 4)
    pix = page.get_pixmap(matrix=mat)
    mode = "RGBA" if pix.alpha else "RGB"
    img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
    if mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
        
    # Run Discovery
    import tempfile
    import google.generativeai as genai
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        full_img_path = tmp.name
    img.save(full_img_path)
    
    discovery_file = genai.upload_file(path=full_img_path)
    try:
        print("Running Discovery...")
        problems = await parser._find_problem_numbers(discovery_file, lambda x: print(x))
        print("Discovered Problems:", problems)
        
        for p in problems:
            if p['number'] == '1':
                start_y = int(img.height * p.get('start_y_ratio', 0.0))
                end_y = int(img.height * p.get('end_y_ratio', 1.0))
                
                print(f"Propblem 1 Y-Coords: {start_y} to {end_y} (Image Height: {img.height})")
                
                cropped = img.crop((0, start_y, img.width, end_y))
                
                padding_height = 2000
                padded_img = Image.new("RGB", (cropped.width, cropped.height + padding_height), (255, 255, 255))
                padded_img.paste(cropped, (0, 0))
                
                save_path = "debug_hue_p1_cropped.png"
                padded_img.save(save_path)
                print(f"Saved cropped image to {save_path}")
                break
                
    finally:
        discovery_file.delete()
        os.remove(full_img_path)

if __name__ == "__main__":
    asyncio.run(check_crop())
