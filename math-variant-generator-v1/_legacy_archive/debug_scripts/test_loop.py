import re

def test_fix(eq_text):
    # Old regex
    out1 = re.sub(r'(?<!\\frac)\{\s*([0-9]*\s*\\(?:bar|overline)\s*(?:\{\s*)?\\beta(?:\s*\})?|[0-9]*\s*\\(?:beta|gamma)\s*)\s*\}\s*\{\s*(\\(?:bar|overline)\s*(?:\{\s*)?\\alpha(?:\s*\})?|\\alpha\s*)\s*\}', r'\\frac{\1}{\2}', eq_text)
    
    # New regex: make backslashes optional for bar/overline and greek letters
    out2 = re.sub(r'(?<!\\frac)\{\s*([0-9]*\s*\\?(?:bar|overline)\s*(?:\{\s*)?\\?(?:alpha|beta|gamma)(?:\s*\})?|[0-9]*\s*\\?(?:alpha|beta|gamma)\s*)\s*\}\s*\{\s*(\\?(?:bar|overline)\s*(?:\{\s*)?\\?(?:alpha|beta|gamma)(?:\s*\})?|\\?(?:alpha|beta|gamma)\s*)\s*\}', r'{\1} over {\2}', eq_text)

    return out1, out2

bad1_a = "{5 \\bar{\\beta}}{\\bar{\\alpha}}"
bad1_b = "{5 bar { beta }}{ bar { alpha }}"
bad2 = "{beta}{alpha}"
print(f"bad1_a:\n  old: {test_fix(bad1_a)[0]}\n  new: {test_fix(bad1_a)[1]}")
print(f"bad1_b:\n  old: {test_fix(bad1_b)[0]}\n  new: {test_fix(bad1_b)[1]}")
print(f"bad2:\n  old: {test_fix(bad2)[0]}\n  new: {test_fix(bad2)[1]}")

# Also replace raw string
q = "alpha bar { beta } + bar { alpha } beta + { {5 beta } over { alpha } } + {5 bar { beta }}{ bar { alpha }"
print("User string:")
print(f"  old: {test_fix(q)[0]}")
print(f"  new: {test_fix(q)[1]}")

