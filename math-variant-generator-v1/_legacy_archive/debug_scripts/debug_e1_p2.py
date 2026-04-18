import asyncio
from hml_generator import HMLGenerator
import json

def test():
    with open("debug_e1_v10.1.json", "r", encoding="utf-8") as f:
        problems = json.load(f)
        
    p2 = problems[1] # question 2
    gen = HMLGenerator()
    
    # Let's see what _parse_text_to_hml produces for the question text
    q_text = p2['question']
    print("--- Original Question Text ---")
    print(q_text)
    
    hml_blocks = gen._parse_text_to_hml(q_text)
    print("\n--- Parsed HML Blocks ---")
    print(hml_blocks)

if __name__ == "__main__":
    test()
