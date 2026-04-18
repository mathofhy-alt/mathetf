import re

count = 0
with open('test_output_abtest.hml', 'r', encoding='utf-8') as f:
    for line in f:
        matches = re.findall(r'<SCRIPT>(.*?)</SCRIPT>', line)
        for m in matches:
            count += 1
            if count <= 10:
                print(f"Eq {count}: {m}")
print(f"Total equations: {count}")
