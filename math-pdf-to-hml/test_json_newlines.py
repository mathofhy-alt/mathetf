import json

text = """{
    "question": "hello
world!"
}"""
try:
    print("Strict=True:", json.loads(text))
except Exception as e:
    print("Strict=True Failed:", e)

try:
    print("Strict=False:", json.loads(text, strict=False))
except Exception as e:
    print("Strict=False Failed:", e)

