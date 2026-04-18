import fitz, re
doc = fitz.open('dist/e3.pdf')
for pg_idx in [4, 7]:
    page = doc[pg_idx]
    pw = page.rect.width
    ph = page.rect.height
    blocks = page.get_text('blocks')
    print(f'=== Page {pg_idx+1} (w={pw:.1f}, h={ph:.1f}) ===')
    for b in blocks:
        if len(b) >= 5 and b[6] == 0:
            x0,y0,x1,y1 = b[:4]
            txt = b[4].strip().replace('\n', ' ')[:60]
            y_pct = y0/ph
            is_valid = (x0 < pw*0.20) or (pw*0.45 < x0 < pw*0.65)
            if is_valid:
                print(f'  [{y_pct:.3f}] x0={x0:.0f} | {repr(txt)}')
doc.close()
print('done')
