
import xml.etree.ElementTree as ET
import os

file_path = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\test_output_endnote.hml"

try:
    tree = ET.parse(file_path)
    root = tree.getroot()

    # Define namespaces if necessary (HML usually doesn't strictly need them for simple find if we ignore ns)
    # But usually HML is messy. Let's iterate all elements.

    print(f"Root: {root.tag}")

    # Find Sections
    sections = root.findall(".//SECTION")
    print(f"Found {len(sections)} Sections")

    # Find Endnotes/Autonums
    # We want to see the sequence of AUTONUM Number=""
    
    autonums = []
    for elem in root.iter():
        if elem.tag == "AUTONUM":
            num = elem.get("Number")
            parent = "Unknown" # Hard to get parent in ElementTree without mapping
            autonums.append(num)

    print(f"AUTONUM Sequence: {autonums}")

    # Check for Section Definitions (SecDef)
    secdefs = root.findall(".//SECDEF")
    print(f"Found {len(secdefs)} SECDEFs")
    for i, sd in enumerate(secdefs):
        start_num = sd.find("STARTNUMBER")
        if start_num is not None:
             print(f"SECDEF[{i}] STARTNUMBER: Endnote={start_num.get('Endnote')}")

    # Let's see if we can identify Q11
    # We look for text "a-1" or similar signature
    for elem in root.iter():
        if elem.text and "a-1" in elem.text and "2a-1" in elem.text:
             print(f"Found potential Q11 text in {elem.tag}: {elem.text[:50]}...")
             # Check distinct attributes of this paragraph?
             
except Exception as e:
    print(f"Error: {e}")
