import fitz
import re
import os

pdf_path = os.path.join(r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v10.1", "dist", "e2.pdf")
doc = fitz.open(pdf_path)

# Regex to match "1.", "1)", "1 )", "1 3)", " 14)"
q_pattern = re.compile(r'^\s*(\d[\d\s]*)\s*[\)\.]')

total_found = 0
for i in range(len(doc)):
    page = doc[i]
    blocks = page.get_text("blocks")
    page_w = page.rect.width
    page_h = page.rect.height
    
    for b in blocks:
        if len(b) >= 5 and b[6] == 0:
            x0, y0, x1, y1, text = b[:5]
            text = text.strip()
            match = q_pattern.match(text)
            if match:
                print(f"Page {i+1} | Q: {match.group(1).replace(' ','').zfill(2)} | y0: {(y0/page_h):.3f} | col: {'left' if x0 < page_w/2 else 'right'} | {text[:20]}")
                total_found += 1

print(f"Total problems found: {total_found}")
