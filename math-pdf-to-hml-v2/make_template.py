import os

template_path = r'c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\template.hml'
output_path = r'c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml\template_data.py'

try:
    with open(template_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # insert {PROBLEMS_CONTENT} just before </SECTION>
    modified = content.replace('</SECTION>', '{PROBLEMS_CONTENT}\n</SECTION>')

    with open(output_path, 'w', encoding='utf-8') as out:
        out.write('BASE_HML_TEMPLATE = r"""' + modified + '"""\n')
    
    print("Success")
except Exception as e:
    print("Error:", e)
