import xml.etree.ElementTree as ET
import re

print("Loading e1.hml...")
try:
    tree = ET.parse('dist/e1.hml')
    root = tree.getroot()
except Exception as e:
    print("Error parsing XML:", e)
    exit(1)

texts = []
print("Searching for paragraphs...")
# Look for Body -> SectionDefinition -> P -> TEXT
for p in root.iter('P'):
    p_text = ''
    for text_node in p.findall('TEXT'):
        # Iterate children
        for child in text_node:
            if child.tag == 'CHAR':
                if child.text:
                    p_text += child.text
            elif child.tag == 'EQUATION':
                script = child.find('SCRIPT')
                if script is not None and script.text:
                    p_text += f' [[EQUATION: {script.text} ]]'
    
    if p_text.strip():
        # Clean up excessive newlines
        cleaned = re.sub(r'[\r\n]+', ' ', p_text.strip())
        texts.append(cleaned)

print(f"Extracted {len(texts)} texts. Showing first 30:")
for i, t in enumerate(texts[:30]):
    print(f"[{i}] {t[:200]}")
