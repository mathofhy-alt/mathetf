import json_repair

sani = '{"eq": "\\\\\\\\\\\\\\\\ y"}'
print("SANI REPR: ", repr(sani))
parsed = json_repair.loads(sani)
print("PARSED REPR: ", repr(parsed['eq']))
