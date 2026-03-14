import re

def show_endnotes(file_path, label):
    print(f"=== {label} ENDNOTES ===")
    try:
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            text = f.read()
    except Exception as e:
        print(e)
        return

    # find real ENDNOTE tags (not ENDNOTESHAPE)
    matches = list(re.finditer(r'<ENDNOTE[> ]', text))
    for i, m in enumerate(matches[:3]):
        start = max(0, m.start() - 150)
        end = min(len(text), m.start() + 400)
        print(f"--- MATCH {i+1} ---")
        print(text[start:end])
        print()

show_endnotes(r'math-pdf-to-hml\sample2.hml', 'sample2.hml')
show_endnotes(r'math-pdf-to-hml\test_output2.hml', 'test_output2.hml')
