import sys
import re

def extract_main_logic(pyc_path):
    print(f"Reading {pyc_path}...")
    with open(pyc_path, 'rb') as f:
        data = f.read()

    text = data.decode('utf-8', errors='ignore')
    
    print("=== EXTRACTED STRINGS FROM MAIN.PYC ===")
    # Extract strings that look like log messages or UI text
    tokens = text.split('\x00')
    for t in tokens:
        cleaned = "".join(c for c in t if c.isprintable()).strip()
        if len(cleaned) > 5:
            print(cleaned)

if __name__ == '__main__':
    main_pyc = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\제미나이요청문제해설v3.exe_extracted\main.pyc"
    extract_main_logic(main_pyc)
