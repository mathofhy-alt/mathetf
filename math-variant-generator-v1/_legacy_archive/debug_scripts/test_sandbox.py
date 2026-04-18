import re

regex = r'(?<!\\frac)\{\s*([0-9]*\s*\\(?:bar|overline)\s*(?:\{\s*)?\\beta(?:\s*\})?|[0-9]*\s*\\(?:beta|gamma)\s*)\s*\}\s*\{\s*(\\(?:bar|overline)\s*(?:\{\s*)?\\alpha(?:\s*\})?|\\alpha\s*)\s*\}'

text = r"\alpha\bar{\beta} + \bar{\alpha}\beta + \frac{5\beta}{\alpha} + {5\bar{\beta}}{\bar{\alpha}}"

out = re.sub(regex, r'\\frac{\1}{\2}', text)
print("ORIGINAL:", text)
print("REPLACED:", out)
