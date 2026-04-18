import json
import json_repair
text = '{"a": "\\n\\\\\\\\ y"}'
with open('debug_json.txt', 'w') as f:
    f.write('Original: ' + repr(text) + '\n')
    f.write('json: ' + repr(json.loads(text)) + '\n')
    f.write('json_repair: ' + repr(json_repair.loads(text)) + '\n')
