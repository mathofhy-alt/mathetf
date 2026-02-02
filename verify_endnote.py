
import os

file_path = "test_output_endnote.hml"

if not os.path.exists(file_path):
    print("File not found")
    exit(1)

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()
    

    # Find all occurrences
    import re
    # Regex to find <ENDNOTE> or <ENDNOTE ...> but not ENDNOTESHAPE
    matches = [m.start() for m in re.finditer(r"<ENDNOTE[ >]", content)]
    
    if not matches:
        print("Real ENDNOTE tag not found")
        exit(0)
    
    for idx in matches:
        # Print 100 chars before and after
        start = max(0, idx - 100)
        end = min(len(content), idx + 200)
        snippet = content[start:end]
        print(f"Found ENDNOTE at {idx}")
        print("Context:")
        print(snippet)

        # Check for CHAR before ENDNOTE in the same TEXT tag
        # We look backwards from ENDNOTE to <TEXT
        text_open_idx = content.rfind("<TEXT", 0, idx)
        if text_open_idx != -1:
            text_content_before = content[text_open_idx:idx]
            print("\nText Content Before Endnote:")
            print(text_content_before)
            
            if "<CHAR> " in text_content_before or "<CHAR> </CHAR>" in text_content_before:
                print("SUCCESS: Found <CHAR> containing space before ENDNOTE.")
            elif "<CHAR" in text_content_before:
                print("WARNING: Found <CHAR> but content might be different.")
                print(text_content_before)
            else:
                print("WARNING: No <CHAR> found before ENDNOTE (Expected space char).")
        else:
            print("Could not find opening TEXT tag")
