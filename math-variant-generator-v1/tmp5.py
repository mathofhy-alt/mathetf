import json_repair

sani = r'{"eq": "\\\\ y"}'
print("SANI: ", repr(sani))
parsed = json_repair.loads(sani)
print("PARSED: ", repr(parsed['eq']))
