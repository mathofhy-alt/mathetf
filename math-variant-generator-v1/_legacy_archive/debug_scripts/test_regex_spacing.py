import re

def fix_equation_spacing(match):
    eq = match.group(1)
    # Add spaces around +, -, =
    eq = re.sub(r'([+\-=])', r' \1 ', eq)
    # Clean up double spaces
    eq = re.sub(r'\s+', ' ', eq)
    return f"[[EQUATION:{eq.strip()}]]"

test_str1 = "① [[EQUATION:x^4-2x^3-10x^2+4x-5]]"
test_str2 = "[[EQUATION:LEFT ( x^2-A RIGHT )=0]]"
test_str3 = "[[EQUATION:x^{-1}]]"

print(re.sub(r'\[\[EQUATION:(.*?)\]\]', fix_equation_spacing, test_str1))
print(re.sub(r'\[\[EQUATION:(.*?)\]\]', fix_equation_spacing, test_str2))
print(re.sub(r'\[\[EQUATION:(.*?)\]\]', fix_equation_spacing, test_str3))
