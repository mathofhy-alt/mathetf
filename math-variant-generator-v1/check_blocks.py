import fitz
import json

pdf_path = r"c:\Users\matho\OneDrive\바탕 화면\pdf모음\테스트.pdf"
doc = fitz.open(pdf_path)
page = doc[0]

# get blocks
blocks = page.get_text("dict")["blocks"]
res = []
for b in blocks:
    if "lines" in b:
        text = ""
        for line in b["lines"]:
            for span in line["spans"]:
                text += span["text"]
        
        # Only print blocks that start with a number (likely problem numbers)
        text = text.strip()
        if text and (text[0].isdigit() or text.startswith("서")):
            res.append({
                "text": text[:20].strip(),
                "bbox": b["bbox"]
            })

for r in res:
    print(r)
