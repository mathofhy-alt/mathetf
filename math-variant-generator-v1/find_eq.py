import re
with open('dist/e1.hml', 'r', encoding='utf-8') as f:
    text = f.read()

m = re.findall(r'<SCRIPT>([^<]*?[ㄱ-ㅎ가-힣][^<]*?)</SCRIPT>', text)
if m:
    print('Found Korean inside Equation Script. Total:', len(m))
    for x in m[:5]: print(x)
else:
    print('No Korean inside Equation Script')
