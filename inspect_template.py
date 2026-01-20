
import re

with open("hml v2-test-tem.hml", "r", encoding="utf-8") as f:
    content = f.read()

section_match = re.search(r"<SECTION[^>]*>(.*?)</SECTION>", content, re.DOTALL)
if section_match:
    section_content = section_match.group(1)
    print("--- SECTION CONTENT START ---")
    print(section_content[:1500])
    print("--- SECTION CONTENT END ---")

    secdef_match = re.search(r"<SECDEF.*?>.*?</SECDEF>", section_content, re.DOTALL)
    if secdef_match:
        print("\n--- FOUND SECDEF ---")
        print(secdef_match.group(0))
    else:
        # Try looking for self-closing SECDEF if not found
        secdef_closing = re.search(r"<SECDEF.*?/>", section_content)
        if secdef_closing:
             print("\n--- FOUND SELF-CLOSING SECDEF ---")
             print(secdef_closing.group(0))
        else:
             print("\n--- NO SECDEF FOUND ---")
else:
    print("No SECTION found")
