import re
import json

def simulate_parse(eq_text):
    LATEX_TO_HWP_MAP = {
        r'\sqrt': 'sqrt',
        r'\bar': 'bar',
        r'\alpha': 'alpha'
    }
    
    # Load dynamic map
    try:
        with open('gemini_hwp_dict.json', 'r', encoding='utf-8') as f:
            dynamic_map = json.load(f)
            LATEX_TO_HWP_MAP.update(dynamic_map)
    except Exception as e:
        print(e)
        
    original = eq_text
    
    # 1. LaTeX 분수 \frac{a}{b} -> {a} over {b} 변환
    eq_text = re.sub(r'\\frac\s*\{\s*(.*?)\s*\}\s*\{\s*(.*?)\s*\}', r'{\1} over {\2}', eq_text)
    eq_text = re.sub(r'^\{\s*(.*?\s+over\s+.*?)\s*\}$', r'\1', eq_text)
    
    # ... environments ...
    
    # 🚀 마스터 사전을 이용한 1차 일괄 치환
    for latex_cmd, hwp_cmd in LATEX_TO_HWP_MAP.items():
        safe_cmd = re.escape(latex_cmd)
        eq_text = re.sub(f'{safe_cmd}(?![a-zA-Z])', f' {hwp_cmd} ', eq_text)
        
    print(f"Original: {original}\nTranslated: {eq_text}\n")

simulate_parse(r"x + y = \sqrt{3}")
simulate_parse(r"\frac{|z|}{z} - \bar{z} = (1 + \bar{z} + \frac{\bar{z}}{z})i")
