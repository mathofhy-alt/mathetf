import sys
import re

def extract_prompt_from_pyc(pyc_path, out_file):
    print(f"Reading {pyc_path}...")
    with open(pyc_path, 'rb') as f:
        data = f.read()
    
    target = "수학 문제".encode('utf-8')
    idx = data.find(target)
    
    start = max(0, idx - 50)
    end = min(len(data), idx + 3500)
    
    extracted = data[start:end]
    text = extracted.decode('utf-8', errors='ignore')
    
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write("=== EXTRACTED PROMPT ===\n")
        lines = text.split('\n')
        for line in lines:
            if len(line.strip()) > 2:
                f.write(line.strip() + '\n')
        f.write("\n========================\n")
    print(f"Successfully dumped to {out_file}.")

if __name__ == '__main__':
    pyc_path = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\제미나이요청문제해설v3.exe_extracted\PYZ.pyz_extracted\gemini_client.pyc"
    out_file = "extracted_v3_prompt.txt"
    extract_prompt_from_pyc(pyc_path, out_file)
