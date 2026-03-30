import re
import sys

def parse_latex(latex: str) -> str:
    # A skeleton simplified parser for testing the bugfix
    i = 0
    output = []
    n = len(latex)
    while i < n:
        if latex[i] in ['_', '^']:
            cmd = latex[i]
            output.append(cmd)
            i += 1
            while i < n and latex[i] in ' \t\n\r':
                i += 1
            if i < n and latex[i].isalnum():
                output.append(f"{{{latex[i]}}}")
                i += 1
        else:
            output.append(latex[i])
            i += 1
    result = "".join(output)
    result = re.sub(r'\s+', ' ', result).strip()
    return result

tests = [
    ("f(x) = (x-p)^2 + q", "f(x) = (x-p)^{2} + q"),
    ("f(x) = (x-p)^2+q", "f(x) = (x-p)^{2}+q"),
    ("f(x_2) - g(x_2) < 0", "f(x_{2}) - g(x_{2}) < 0"),
    ("f(x_2)-g(x_2)<0", "f(x_{2})-g(x_{2})<0"),
    ("x^{2+q}", "x^{2+q}"),
]

for inp, exp in tests:
    out = parse_latex(inp)
    assert out == exp, f"Failed on {inp}: expected {exp}, got {out}"

print("All tests passed.")
