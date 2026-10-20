import re, html as H
def text_of(x):
    x = re.sub(r'<EQUATION\b.*?<SCRIPT>(.*?)</SCRIPT>.*?</EQUATION>', lambda m: ' ⟦' + H.unescape(m[1]).strip() + '⟧ ', x, flags=re.S)
    x = re.sub(r'</P>', '\n', x)
    x = re.sub(r'<[^>]+>', '', x)
    x = H.unescape(x)
    return re.sub(r'[ \t]+', ' ', re.sub(r'\n\s*\n+', '\n', x)).strip()
def split(xml):
    s = xml[xml.find('?>')+2:] if xml.startswith('<?') else xml
    notes = re.findall(r'<ENDNOTE>(.*?)</ENDNOTE>', s, flags=re.S)
    stem = re.sub(r'<ENDNOTE>.*?</ENDNOTE>', '', s, flags=re.S)
    return text_of(stem), '\n'.join(text_of(n) for n in notes)
