with open('dist/e1.hml', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('&lt;보기&gt;')
if idx != -1:
    print('Found &lt;보기&gt; context:')
    print(text[max(0, idx-300):min(len(text), idx+300)])
else:
    print('&lt;보기&gt; not found at all!')
