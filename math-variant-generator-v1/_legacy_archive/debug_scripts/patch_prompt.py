import sys
f = 'gemini_client.py'
c = open(f, encoding='utf-8').read()

marker = '   - **수식 중심 개조식**으로 작성하세요.'
insert = '\n   - \U0001f6a8 **[함수 정의 줄바꿈 분리 필수]**: f(x), g(x), h(x) 등 서로 다른 함수 정의가 여러 개 있을 때 절대 한 줄에 이어 쓰지 마세요. 반드시 함수마다 별도 줄(\\\\n)로 분리하세요.'

if '서로 다른 함수 정의' in c:
    print('ALREADY PATCHED')
    sys.exit(0)

if marker in c:
    c = c.replace(marker, marker + insert, 1)
    open(f, 'w', encoding='utf-8').write(c)
    print('OK')
else:
    print('MARKER NOT FOUND')
