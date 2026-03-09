import json
import re

text = r"""[
  {
    "question": "[[EQUATION:\times]] and [[EQUATION:\tan]] and [[EQUATION:\Rightarrow]] and [[EQUATION:\rho]] and [[EQUATION:\frac]] and [[EQUATION:\beta]] and [[EQUATION:\nabla]] and [[EQUATION:\neq]] and [[EQUATION:\ni]]",
    "answer_options": [],
    "explanation": ""
  }
]"""

def sanitize_json(text):
    text = re.sub(r'\\+', r'\\', text)
    
    latex_keywords = [
        'times', 'tan', 'rightarrow', 'Rightarrow', 'rho', 
        'frac', 'beta', 'bar', 'nabla', 'neq', 'ni',
        'theta', 'tau', 'varphi', 'phi', 'pi', 'psi',
        'nu', 'mu', 'lambda', 'kappa', 'iota', 'eta',
        'zeta', 'epsilon', 'delta', 'gamma', 'alpha',
        'omega', 'chi', 'upsilon', 'sigma', 'xi',
        'Theta', 'Phi', 'Pi', 'Psi', 'Lambda', 'Delta',
        'Gamma', 'Omega', 'Sigma', 'Xi', 'Upsilon',
        'cdot', 'sqrt', 'left', 'right', 'sum', 'prod',
        'int', 'oint', 'lim', 'infty', 'approx', 'equiv',
        'propto', 'sim', 'simeq', 'asymp', 'doteq', 'propto'
    ]
    for kw in latex_keywords:
        text = text.replace('\\' + kw, '\\\\' + kw)
        
    text = re.sub(r'(?<!\\)\\([^"\\/bfnrtu])', r'\\\\\1', text)
    return text

fixed = sanitize_json(text)
print("FIXED:", fixed)
try:
    res = json.loads(fixed)
    print("Parsed:", res[0]['question'])
except Exception as e:
    print("Error:", e)
