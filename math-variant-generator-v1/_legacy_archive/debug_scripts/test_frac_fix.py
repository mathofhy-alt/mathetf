import re
from hml_generator import HMLGenerator
gen = HMLGenerator()

def fix(eq_text):
    # original regex for strictly closed blocks with optional slashes:
    # r'(?<!\\frac)\{\s*([0-9]*\s*\\?(?:bar|overline)\s*(?:\{\s*)?\\?(?:alpha|beta|gamma)(?:\s*\})?|[0-9]*\s*\\?(?:alpha|beta|gamma)\s*)\s*\}\s*\{\s*(\\?(?:bar|overline)\s*(?:\{\s*)?\\?(?:alpha|beta|gamma)(?:\s*\})?|\\?(?:alpha|beta|gamma)\s*)\s*\}'
    
    # We will expand it slightly. The issue is {5 bar { beta }}{ bar { alpha }
    # Look at the first block: `5 bar { beta }`
    # The previous regex required the WHOLE block 1 to match exactly:
    #   [0-9]*\s*\\?(?:bar|overline)\s*(?:\{\s*)?\\?(?:alpha|beta|gamma)(?:\s*\})?
    # This DOES match `5 bar { beta }`.
    # Look at the second block: ` bar { alpha }`
    # The previous regex required the WHOLE block 2 to match exactly:
    #   \\?(?:bar|overline)\s*(?:\{\s*)?\\?(?:alpha|beta|gamma)(?:\s*\})?  <-- notice the (?:\s*\})?
    # This DOES match ` bar { alpha }`.
    
    # Wait! If the second block is ` bar { alpha }`, it doesn't contain the final closing brace for the OUTER block!
    # The outer brace `}` in the original regex `\s*\}` is missing from the user's string!
    # Original regex ended with: `\s*\}`
    # We just need to make that final `\s*\}` optional!
    
    pattern = r'(?<!\\frac)\{\s*([0-9]*\s*\\?(?:bar|overline)\s*(?:\{\s*)?\\?(?:alpha|beta|gamma)(?:\s*\})?|[0-9]*\s*\\?(?:alpha|beta|gamma)\s*)\s*\}\s*\{\s*(\\?(?:bar|overline)\s*(?:\{\s*)?\\?(?:alpha|beta|gamma)(?:\s*\})?|\\?(?:alpha|beta|gamma)\s*)(?:\s*\})?'
    
    eq_text = re.sub(pattern, r'{\1} over {\2}', eq_text)
    return eq_text

q = "alpha bar { beta } + bar { alpha } beta + { {5 beta } over { alpha } } + {5 bar { beta }}{ bar { alpha }"
print("Fixed:", fix(q))

