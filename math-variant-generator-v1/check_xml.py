import xml.etree.ElementTree as ET
try:
    ET.parse('ex1_with_variants.hml')
    print("Success")
except ET.ParseError as e:
    line, col = e.position
    print(f"Error at line {line}, col {col}")
    with open('ex1_with_variants.hml', 'r', encoding='utf-8') as f:
        lines = f.readlines()
        if line <= len(lines):
            error_line = lines[line-1]
            start = max(0, col - 80)
            end = min(len(error_line), col + 80)
            print(error_line[start:end])
            print(' '*(col - start) + '^')
