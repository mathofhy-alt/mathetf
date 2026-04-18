import fitz

def test_vector_search():
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\hue.pdf"
    doc = fitz.open(pdf_path)
    page = doc[0]
    
    # 1) 텍스트를 검색
    rects1 = page.search_for("1)")
    print(f"Rects for '1)': {rects1}")
    
    rects2 = page.search_for("2)")
    print(f"Rects for '2)': {rects2}")
    
if __name__ == "__main__":
    test_vector_search()
