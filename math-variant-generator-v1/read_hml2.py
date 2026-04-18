import xml.etree.ElementTree as ET
import re

tree = ET.parse('dist/e1.hml')
root = tree.getroot()

for p in root.iter('P'):
    p_text = ''
    for text_node in p.findall('TEXT'):
        for child in text_node:
            if child.tag == 'CHAR':
                if child.text: p_text += child.text
            elif child.tag == 'EQUATION':
                script = child.find('SCRIPT')
                if script is not None and script.text:
                    p_text += f' [[EQ: {script.text} ]]'
    
    cleaned = re.sub(r'[\r\n]+', ' ', p_text.strip())
    if "보기" in cleaned or "(가)" in cleaned or "대하여 옳은 것을" in cleaned:
        print(f"FOUND: {cleaned}")
