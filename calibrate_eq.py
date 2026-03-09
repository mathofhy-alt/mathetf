import sys
import xml.etree.ElementTree as ET
import re

# `hml_generator.py`의 `_estimate_equation_size` 함수를 가져와서 테스트합니다.
from hml_generator import HMLGenerator
gen = HMLGenerator()

try:
    with open('sample_eq.hml', 'r', encoding='utf-8') as f:
        content = f.read()

    pattern = re.compile(r'<EQUATION.*?>.*?<SIZE\s+Height="(\d+)".*?Width="(\d+)".*?/>.*?<SCRIPT>(.*?)</SCRIPT>.*?</EQUATION>', re.DOTALL)
    matches = pattern.findall(content)
    
    total_diff = 0
    max_diff = 0
    max_diff_script = ""
    
    for height, width, script in matches:
        script = script.strip().replace('\n', ' ')
        real_w = int(width)
        real_h = int(height)
        
        # Generator의 추정치 호출
        est_w, est_h, est_base = gen._estimate_equation_size(script)
        
        diff_w = est_w - real_w
        if abs(diff_w) > abs(max_diff):
            max_diff = diff_w
            max_diff_script = script
            
        total_diff += abs(diff_w)
        print(f"[{diff_w:>5}] R_W: {real_w:>5} | E_W: {est_w:>5} | {script}")
        
    print("-" * 80)
    print(f"Average Width Diff: {total_diff / len(matches):.2f}")
    print(f"Max Diff: {max_diff} on script: {max_diff_script}")

except Exception as e:
    print(f"Error: {e}")
