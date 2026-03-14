import re

def process_frac(eq_text):
    # We must recursively replace \frac{A}{B} with {A} over {B}
    # Since regex can't easily handle arbitrarily nested braces cleanly, 
    # we use a small state machine/stack to find the matching braces.
    
    while True:
        # Find the first occurrence of \frac
        match = re.search(r'\\frac\b\s*', eq_text)
        if not match:
            break
            
        start_idx = match.start()
        after_frac_idx = match.end()
        
        # We need to find the two arguments
        def get_next_arg(text, start):
            # skips whitespace
            idx = start
            while idx < len(text) and text[idx].isspace():
                idx += 1
            if idx >= len(text):
                return None, None
                
            if text[idx] == '{':
                # find matching brace
                brace_count = 0
                arg_start = idx
                for i in range(idx, len(text)):
                    if text[i] == '{':
                        brace_count += 1
                    elif text[i] == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            return text[arg_start+1:i], i + 1
            else:
                # Just a single character
                return text[idx], idx + 1
            return None, None
            
        arg1, next_start = get_next_arg(eq_text, after_frac_idx)
        if arg1 is None:
            # Malformed frac, just remove \frac to avoid infinite loop
            eq_text = eq_text[:start_idx] + eq_text[after_frac_idx:]
            continue
            
        arg2, end_idx = get_next_arg(eq_text, next_start)
        if arg2 is None:
            # Malformed frac, just remove \frac
            eq_text = eq_text[:start_idx] + eq_text[after_frac_idx:]
            continue
            
        # Replace the whole \frac block
        replacement = f" {{{arg1}}} over {{{arg2}}} "
        eq_text = eq_text[:start_idx] + replacement + eq_text[end_idx:]
        
    return eq_text

tests = [
    r"\frac{1-i\sqrt{3}}{1+\sqrt{3}i}",
    r"\frac{ \frac{1}{2} }{ 3 }",
    r"\frac 5 4",
    r"\frac{5} 4"
]

for t in tests:
    print(f"Input: {t}")
    print(f"Output: {process_frac(t)}\n")
