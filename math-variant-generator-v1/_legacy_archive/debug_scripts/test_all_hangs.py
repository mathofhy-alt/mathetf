import sys
import glob
import re
import threading
sys.path.append('.')
from hml_generator import HMLGenerator

gen = HMLGenerator()

def test_text(content, filename):
    print(f"Testing regex on {filename}...")
    try:
        gen._parse_text_to_hml(content)
        print(f"SUCCESS on {filename}")
    except Exception as e:
        print(f"Error on {filename}: {e}")

files = glob.glob('debug_raw_stitched_page_*.txt')
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
        
    t = threading.Thread(target=test_text, args=(content, f))
    t.start()
    t.join(timeout=3)
    if t.is_alive():
        print(f"HANG DETECTED ON {f}!!!")
        import os
        os._exit(1)
        
print("All files processed.")
