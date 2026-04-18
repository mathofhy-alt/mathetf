import re

text1 = r'\alpha \bar{\beta} + \bar{\alpha} \beta + \frac{5\beta}{\alpha} + {5\bar{\beta}}{\bar{\alpha}}'
text2 = r'\alpha \bar{\beta} + \bar{\alpha} \beta + \frac{5\beta}{\alpha} + {5\bar\beta}{\bar\alpha}'
text3 = r'\alpha \bar{\beta} + \bar{\alpha} \beta + \frac{5\beta}{\alpha} + {5\overline{\beta}}{\overline{\alpha}}'
text4 = r'\alpha \bar{\beta} + \bar{\alpha} \beta + \frac{5\beta}{\alpha} + {5\overline\beta}{\overline\alpha}'

# Using a combination of lookbehinds because length must be uniform, but we can't use `|` inside lookbehind if lengths differ.
# Wait! `(?<!\\frac)` is length 5. `(?<!_over)` is length 5.
# If we just use `(?<!\\frac)`, that's enough since Gemini only uses `\frac` for fractions.

pattern = r'(?<!\\frac)\{\s*([0-9]*\s*\\(?:bar|overline)\s*(?:\{\s*)?\\beta(?:\s*\})?|[0-9]*\s*\\beta\s*)\s*\}\s*\{\s*(\\(?:bar|overline)\s*(?:\{\s*)?\\alpha(?:\s*\})?|\\alpha\s*)\s*\}'

print("1:", re.sub(pattern, r'\\frac{\1}{\2}', text1))
print("2:", re.sub(pattern, r'\\frac{\1}{\2}', text2))
print("3:", re.sub(pattern, r'\\frac{\1}{\2}', text3))
print("4:", re.sub(pattern, r'\\frac{\1}{\2}', text4))
