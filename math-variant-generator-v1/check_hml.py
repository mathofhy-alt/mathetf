"""HML 파일 구조 + 11,14,20번 내용 확인"""
import re, sys

with open(r"dist\e3.hml", 'r', encoding='utf-8-sig') as f:
    content = f.read()

print(f"파일 크기: {len(content)} chars")
print("--- 처음 500자 ---")
print(content[:500])
print("\n--- 태그 목록 (유니크) ---")
tags = re.findall(r'<[A-Z_]+>', content)
from collections import Counter
for tag, cnt in Counter(tags).most_common(20):
    print(f"  {tag}: {cnt}")
