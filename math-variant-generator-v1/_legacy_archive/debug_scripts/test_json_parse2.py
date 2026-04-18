import json
import re

def _sanitize_json(text):
    # Remove markdown code block markers
    text = re.sub(r'```json\s*', '', text)
    text = re.sub(r'```\s*', '', text)
    
    first = text.find('[') if '[' in text else text.find('{')
    last = text.rfind(']') if ']' in text else text.rfind('}')
    if first != -1 and last != -1:
        text = text[first:last+1]
        
    # JSON strict escaping fixes
    # 1. Escape unescaped backslashes, but ignore already escaped ones (\\) or control chars (\n, \t, etc)
    # Actually, the simplest robust way for Gemini responses is often dealing with literal newlines inside strings
    def escape_newlines(match):
        return match.group(0).replace('\n', '\\n').replace('\r', '')

    # Try to find string values and escape literal newlines within them
    text = re.sub(r'"([^"\\]*(?:\\.[^"\\]*)*)"', escape_newlines, text)
    
    return text

def _extract_json_objects(text):
    try:
        obj = json.loads(text)
        return [obj] if isinstance(obj, dict) else obj
    except Exception as e:
        print(f"Standard parse failed: {e}")
        # Brute-force bracket matching fallback
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
                            # Try parsing the extracted string. If it fails due to strictness, try strict=False
                            try:
                                objects.append(json.loads(text[start:i+1]))
                            except:
                                objects.append(json.loads(text[start:i+1], strict=False))
                            break
                        except Exception as e2: 
                            print(f"Fallback parse failed: {e2}")
                            pass
        return objects


raw_text_with_error = """[
  {
    "question_num": "11",
    "question": "수직선 위를 움직이는 점 [[EQUATION:P]]의 시각 [[EQUATION:t(t >= 0)]]에서의 속도
[[EQUATION:v(t)]]가 다음과 같다.",
    "answer_options": [],
    "thought_process": "",
    "explanation": ""
  }
]"""

cleaned = _sanitize_json(raw_text_with_error)
print("CLEANED TEXT")
print(cleaned)
extracted = _extract_json_objects(cleaned)
print("EXTRACTED:", extracted)

