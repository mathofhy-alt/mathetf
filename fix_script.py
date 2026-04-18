import codecs

p1 = r'math-pdf-to-hml-v13\hml_generator.py'
with codecs.open(p1, 'r', 'utf-8') as f:
    c1 = f.read()

c1 = c1.replace(r'최댓\s+값', r'최댓[ \t]+값')
c1 = c1.replace(r'최대\s+값', r'최대[ \t]+값')
c1 = c1.replace(r'최솟\s+값', r'최솟[ \t]+값')
c1 = c1.replace(r'최소\s+값', r'최소[ \t]+값')
c1 = c1.replace(r'함숫\s+값', r'함숫[ \t]+값')
c1 = c1.replace(r'함수\s+값', r'함수[ \t]+값')
c1 = c1.replace(r'극한\s+값', r'극한[ \t]+값')
c1 = c1.replace(r'기댓\s+값', r'기댓[ \t]+값')
c1 = c1.replace(r'기대\s+값', r'기대[ \t]+값')
c1 = c1.replace(r'대푯\s+값', r'대푯[ \t]+값')
c1 = c1.replace(r'대표\s+값', r'대표[ \t]+값')
c1 = c1.replace(r'관계\s+없이', r'관계[ \t]+없이')
c1 = c1.replace(r'상관\s+없이', r'상관[ \t]+없이')

c1 = c1.replace(r'([가-힣\]\)0-9a-zA-Z])\s+(은|는|을|를|의|에|에서|로|으로|와|과|도|만|부터|까지|이다|입니다|일때)', r'([가-힣\]\)0-9a-zA-Z])[ \t]+(은|는|을|를|의|에|에서|로|으로|와|과|도|만|부터|까지|이다|입니다|일때)')
c1 = c1.replace(r'([가-힣\]\)0-9a-zA-Z])\s+(일\s+때)', r'([가-힣\]\)0-9a-zA-Z])[ \t]+(일[ \t]+때)')
c1 = c1.replace(r'(것|수|값|식|점|선|면|원|해|근|비|합|차|곱|몫|양|음|짝|홀|답|때)\s+(이|가)', r'(것|수|값|식|점|선|면|원|해|근|비|합|차|곱|몫|양|음|짝|홀|답|때)[ \t]+(이|가)')
c1 = c1.replace(r'([가-힣\]\)0-9a-zA-Z])\s+(은|는|을|를|의|에|도|만)', r'([가-힣\]\)0-9a-zA-Z])[ \t]+(은|는|을|를|의|에|도|만)')

with codecs.open(p1, 'w', 'utf-8') as f:
    f.write(c1)

p2 = r'math-pdf-to-hml-v13\gemini_client.py'
with codecs.open(p2, 'r', 'utf-8') as f:
    c2 = f.read()

old_str = '8. **[단어 누락 / <보기> 공백 절대 금지]** 사소한 단어를 빼먹지 마세요. <보 기> 처럼 공백이 있더라도 무조건 공백을 제거하고 <보기> 로 붙여서 추출하세요.\n"""'
new_str = '8. **[단어 누락 / <보기> 공백 절대 금지]** 사소한 단어를 빼먹지 마세요. <보 기> 처럼 공백이 있더라도 무조건 공백을 제거하고 <보기> 로 붙여서 추출하세요.\n9. 🚨 **[줄바꿈 완벽 보존]** 원본에서 단락/줄이 바뀌는 곳은 무조건 추출결과에도 줄바꿈 문자(\\n)를 삽입하세요. 임의로 여러 줄을 뭉개지 마세요.\n"""'

if old_str in c2:
    c2 = c2.replace(old_str, new_str)
    with codecs.open(p2, 'w', 'utf-8') as f:
        f.write(c2)

print("Patch applied successfully!")
