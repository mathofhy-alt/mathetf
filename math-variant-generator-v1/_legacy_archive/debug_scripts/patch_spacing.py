import re

with open('gemini_client.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the regex issue where 're' is not imported in the inner scope
old_str = "eq = re.sub(r'\\s+', ' ', eq).strip()"
new_str = "import re as regex\n                                eq = regex.sub(r'\\s+', ' ', eq).strip()"

if old_str in content:
    content = content.replace(old_str, new_str)
    with open('gemini_client.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patch applied successfully.")
else:
    print("Already patched or string not found.")
