import json

text = """[
  {
    "test": "line1
line2"
  }
]"""

print('Default:')
try:
    print(json.loads(text))
except Exception as e:
    print(e)
    
print('\nStrict=False:')
try:
    print(json.loads(text, strict=False))
except Exception as e:
    print(e)
