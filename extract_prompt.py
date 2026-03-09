import sys
import re

def extract_prompt_from_pyc(pyc_path):
    print(f"Reading {pyc_path}...")
    with open(pyc_path, 'rb') as f:
        data = f.read()
    
    # Try finding UTF-8 string
    target = "수학 문제".encode('utf-8')
    idx = data.find(target)
    
    if idx == -1:
        print("Not found.")
        return
        
    print(f"Found match at index {idx}!")
    
    start = max(0, idx - 50)
    end = min(len(data), idx + 3000)
    
    extracted = data[start:end]
    text = extracted.decode('utf-8', errors='ignore')
    print("=== EXTRACTED PROMPT ===")
    
    # Print lines that look like text
    lines = text.split('\n')
    for line in lines:
        if len(line.strip()) > 2:
            print(line.strip())
            
    print("========================\n")

if __name__ == '__main__':
    pyc_path = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\제미나이요청문제해설v3.exe_extracted\PYZ.pyz_extracted\gemini_client.pyc"
    extract_prompt_from_pyc(pyc_path)
