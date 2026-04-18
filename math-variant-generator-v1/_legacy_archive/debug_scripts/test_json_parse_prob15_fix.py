import json
import re
import ast

def _sanitize_json(text):
    text = re.sub(r'```json\s*', '', text)
    text = re.sub(r'```\s*', '', text)
    
    # We won't tightly bounded by first/last brackets because the last bracket might be garbage
    first = text.find('[') if '[' in text else text.find('{')
    if first != -1:
        text = text[first:]
        
    def escape_newlines(match):
        return match.group(0).replace('\n', '\\n').replace('\r', '')
    text = re.sub(r'"([^"\\]*(?:\\.[^"\\]*)*)"', escape_newlines, text)
    
    text = text.replace(r'\{', '{').replace(r'\}', '}').replace(r'\[', '[').replace(r'\]', ']')
    
    return text

def _extract_json_objects(text):
    # 1. raw_decode ignores trailing garbage completely
    try:
        obj, idx = json.JSONDecoder(strict=False).raw_decode(text.lstrip())
        return [obj] if isinstance(obj, dict) else obj
    except Exception as e:
        print("raw_decode failed:", e)
        pass
        
    # 2. ast.literal_eval fallback
    try:
        py_text = text.replace('true', 'True').replace('false', 'False').replace('null', 'None')
        # ast.literal_eval doesn't like trailing garbage, so we should try to bound it.
        last = py_text.rfind(']') if ']' in py_text else py_text.rfind('}')
        if last != -1:
            obj = ast.literal_eval(py_text[:last+1])
            return [obj] if isinstance(obj, dict) else obj
    except Exception as e:
        print("ast.literal_eval failed:", e)
        pass

    # 3. Brute-force bracket matching fallback
    objects = []
    pattern = re.compile(r'\{\s*"(question|question_num)"')
    for match in pattern.finditer(text):
        start = match.start()
        count = 0
        for i in range(start, len(text)):
            if text[i] == '{': count += 1
            elif text[i] == '}':
                count -= 1
                if count == 0:
                    try:
                        objects.append(json.loads(text[start:i+1], strict=False))
                        break
                    except Exception as e: 
                        print("bracket matching failed:", e)
                        pass
    return objects


with open("raw_prob15.txt", "r", encoding="utf-8") as f:
    raw_text = f.read()

sanitized = _sanitize_json(raw_text)
extracted = _extract_json_objects(sanitized)
if extracted:
    print("SUCCESSFULLY PARSED PROBLEM 15!")
else:
    print("STILL FAILED.")
