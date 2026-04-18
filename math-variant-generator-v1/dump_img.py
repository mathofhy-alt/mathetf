import fitz
from PIL import Image

pdf_path = r"c:\Users\matho\OneDrive\바탕 화면\pdf모음\테스트.pdf"
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

padding_height = 2000
padded_img = Image.new("RGB", (img.width, img.height + padding_height), (255, 255, 255))
padded_img.paste(img, (0, 0))

padded_img.save("test_padded_dump.png")
print("Saved to test_padded_dump.png")
