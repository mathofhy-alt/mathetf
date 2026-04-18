from hml_generator import HMLGenerator
import json

def test():
    gen = HMLGenerator()
    test_text = "이므로 [[EQUATION:alpha bar alpha = 16 + 9 = 25]]이다."
    print("===== TEST 1 =====")
    print(gen._parse_text_to_hml(test_text))
    print("\n===== FULL TEST =====")
    with open("final_hwpx_payload.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    print(gen._parse_text_to_hml(data[0]['explanation']))

if __name__ == "__main__":
    test()
