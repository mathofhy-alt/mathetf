import sys
import re

def extract_regex_from_pyc(pyc_path):
    print(f"Reading {pyc_path}...")
    with open(pyc_path, 'rb') as f:
        data = f.read()

    text = data.decode('utf-8', errors='ignore')
    
    print("=== EXTRACTED ALL READABLE STRINGS (length > 10) ===")
    lines = text.split('\x00') # split by null bytes which separates constant strings in pyc
    for line in lines:
        cleaned = "".join(c for c in line if c.isprintable())
        if len(cleaned) > 10 and not cleaned.startswith('Z\x00') and not cleaned.startswith('gemini'):
            print(cleaned)
            
    print("\n=== EXTRACTING MODEL NAME ===")
    for model in ['gemini-1.5-flash', 'gemini-3-flash-preview', 'gemini-pro']:
        if model in text:
            print(f"FOUND: {model}")

if __name__ == '__main__':
    pyc_path = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\제미나이요청문제해설v3.exe_extracted\PYZ.pyz_extracted\gemini_client.pyc"
    extract_regex_from_pyc(pyc_path)
