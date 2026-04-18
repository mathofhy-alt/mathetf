import fitz
import os
import re

pdf_path = os.path.join(r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v10.1", "dist", "e1.pdf")
doc = fitz.open(pdf_path)
page = doc[0]
blocks = page.get_text("blocks")

print("Dumping all text blocks on e1.pdf Page 1:")
for b in blocks:
    if len(b) >= 5 and b[6] == 0:
        print(repr(b[4]))
