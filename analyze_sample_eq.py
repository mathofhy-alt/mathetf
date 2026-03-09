import xml.etree.ElementTree as ET
import re
import sys

try:
    with open('sample_eq.hml', 'r', encoding='utf-8') as f:
        content = f.read()

    # 정규식으로 직접 추출 (xml 파싱이 네임스페이스 등으로 깨질수있으므로)
    # <EQUATION ...><SHAPEOBJECT ...><SIZE Height="1313" ... Width="7594" .../><POSITION .../><OUTSIDEMARGIN .../><SHAPECOMMENT>수식입니다.</SHAPECOMMENT></SHAPEOBJECT><SCRIPT>A=2x  ^{2} -5x-4</SCRIPT></EQUATION>
    
    pattern = re.compile(r'<EQUATION.*?>.*?<SIZE\s+Height="(\d+)".*?Width="(\d+)".*?/>.*?<SCRIPT>(.*?)</SCRIPT>.*?</EQUATION>', re.DOTALL)
    
    matches = pattern.findall(content)
    
    print(f"Total equations found: {len(matches)}")
    print("-" * 80)
    for height, width, script in matches:
        script = script.strip().replace('\n', ' ')
        print(f"W: {width:>5} | H: {height:>4} | {script}")
        
except Exception as e:
    print(f"Error: {e}")
