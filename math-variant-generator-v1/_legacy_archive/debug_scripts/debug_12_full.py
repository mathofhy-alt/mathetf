import asyncio
from gemini_client import GeminiMathParser

async def test_p12():
    with open("gemini_api_key.txt", "r", encoding="utf-8") as f:
        key = f.read().strip()
    parser = GeminiMathParser(api_key=key, model_name="gemini-3-flash-preview")
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\e1.pdf"
    
    import fitz, base64
    from PIL import Image
    from io import BytesIO
    doc = fitz.open(pdf_path)
    page = doc[2]
    pix = page.get_pixmap(matrix=fitz.Matrix(3,3))
    
    w, h = pix.width, pix.height
    crop_box = (w//2, h//2, w, h)
    
    img = Image.open(BytesIO(pix.tobytes("png"))).crop(crop_box)
    
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    b64_img = base64.b64encode(buffer.getvalue()).decode("utf-8")
    
    res = await parser._extract_single_problem("12", b64_img)
    import json
    print("\n=== FINAL JSON OUTPUT ===")
    print(json.dumps(res, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    asyncio.run(test_p12())
