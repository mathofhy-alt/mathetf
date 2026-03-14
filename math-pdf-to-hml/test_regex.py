import re

text1 = r"\((a+1)(b+1)(c+1) = 70\)"
text2 = r"[[EQUATION{g(x) = \frac{x^2 - 4x + 6}{x - 2} \ (x \neq 2)}]]"

# Test 1: Why did \( fail?
res1 = re.sub(r'\\\((.*?)\\\)', r'[[EQUATION:\1]]', text1, flags=re.DOTALL)
print("Test 1 Match:", res1)

# Test 2: AI hallucinates [[EQUATION{...}]] instead of [[EQUATION:...]]
text2_fixed = re.sub(r'\[\[EQUATION\{(.*?)\}\]\]', r'[[EQUATION:\1]]', text2, flags=re.DOTALL)
print("Test 2 Fixed:", text2_fixed)

# Test 3: What if the AI just doesn't wrap \alpha? 
text3 = r"x좌표를 각각 \alpha, \beta (\alpha < \beta)라 하자."
# We can't automatically wrap \alpha easily because we don't know where the math ends, 
# BUT we can wrap loose \alpha, \beta, \gamma if they appear in text.
