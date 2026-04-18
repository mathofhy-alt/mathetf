import fitz
from PIL import Image
import os
import tempfile

def test_jpg_compression():
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\hue.pdf"
    doc = fitz.open(pdf_path)
    page = doc[0]
    
    # Render full page at massive 4x4 matrix
    mat = fitz.Matrix(4, 4)
    pix = page.get_pixmap(matrix=mat)
    mode = "RGBA" if pix.alpha else "RGB"
    img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
    if mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
        
    print(f"Full page 4x4 Pixel Size: {img.size}")
    
    # 1. Save as PNG
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_png:
        png_path = tmp_png.name
    img.save(png_path, format="PNG")
    png_size_mb = os.path.getsize(png_path) / (1024 * 1024)
    print(f"PNG File Size: {png_size_mb:.2f} MB")
    
    # 2. Save as WEBP
    with tempfile.NamedTemporaryFile(suffix=".webp", delete=False) as tmp_webp:
        webp_path = tmp_webp.name
    img.save(webp_path, format="WEBP", quality=95)
    webp_size_mb = os.path.getsize(webp_path) / (1024 * 1024)
    print(f"WEBP File Size: {webp_size_mb:.2f} MB")
    
    # 3. Save as JPEG
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_jpg:
        jpg_path = tmp_jpg.name
    img.save(jpg_path, format="JPEG", quality=95)
    jpg_size_mb = os.path.getsize(jpg_path) / (1024 * 1024)
    print(f"JPEG File Size: {jpg_size_mb:.2f} MB")
    
if __name__ == "__main__":
    test_jpg_compression()
