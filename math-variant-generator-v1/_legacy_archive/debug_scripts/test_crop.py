import fitz
from PIL import Image

def test_crop():
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\hue.pdf"
    doc = fitz.open(pdf_path)
    page = doc[0]
    
    # Render full page at 4x4 matrix
    mat = fitz.Matrix(4, 4)
    pix = page.get_pixmap(matrix=mat)
    mode = "RGBA" if pix.alpha else "RGB"
    img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
    if mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
        
    print(f"Full page 4x4 size: {img.size}")
    
    # Let's crop the top half manually for testing (since Problem 1 is at the top)
    # y = 0.0 to 0.4
    crop_height = int(img.height * 0.4)
    cropped_img = img.crop((0, 0, img.width, crop_height))
    
    cropped_img.save("cropped_test_4x4.png")
    print(f"Cropped saved to cropped_test_4x4.png. Size: {cropped_img.size}")
    
if __name__ == "__main__":
    test_crop()
