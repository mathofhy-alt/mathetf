import os
from hml_generator import HMLGenerator

# Mocking the change
class FixedHMLGenerator(HMLGenerator):
    def _parse_text_to_hml(self, text: str) -> str:
        # Before calling parent, let's fix \to in the text
        text = text.replace(r'\to', r'\rightarrow')
        return super()._parse_text_to_hml(text)

gen = FixedHMLGenerator()

# test
raw_text = r"[[EQUATION:\lim_{h \to 0} \frac{f(4+h)-f(4)}{h}]]"
# We can't mock the `\frac` logic directly without overriding the whole method, 
# but we can look at what it would output.
import re

def preview_frac_fix(eq_text):
    while True:
        match = re.search(r'\\frac\b\s*', eq_text)
        if not match:
            break
            
        start_idx = match.start()
        after_frac_idx = match.end()
        
        def get_next_arg(text, start):
            idx = start
            while idx < len(text) and text[idx].isspace():
                idx += 1
            if idx >= len(text):
                return None, None
            
            if text[idx] == '{':
                brace_count = 0
                arg_start = idx
                for i in range(idx, len(text)):
                    if text[i] == '{': brace_count += 1
                    elif text[i] == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            return text[arg_start+1:i], i + 1
            else:
                return text[idx], idx + 1
            return None, None
            
        arg1, next_start = get_next_arg(eq_text, after_frac_idx)
        if arg1 is None: break
        arg2, end_idx = get_next_arg(eq_text, next_start)
        if arg2 is None: break
            
        # The new replacement with outer brackets
        replacement = f" {{ {{{arg1}}} over {{{arg2}}} }} "
        eq_text = eq_text[:start_idx] + replacement + eq_text[end_idx:]
    return eq_text

fixed_frac = preview_frac_fix(r"\lim_{h \to 0} \frac{f(4+h)-f(4)}{h}")
print("Fixed frac:", fixed_frac)

