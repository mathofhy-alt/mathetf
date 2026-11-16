/** [11/17] 책 소개 글(머리말) — 빈 줄로 문단, '- C 이름: 설명' 줄은 방식 카드, '이렇게 쓰세요.'로 시작하는 문단은 강조 */
export default function BookPreface({ text, children }: { text: string; children?: React.ReactNode }) {
    const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    let placed = false;
    return <>{blocks.map((b, k) => {
        const lines = b.split('\n');
        if (lines.every(l => l.trim().startsWith('- '))) {
            const items = lines.map(l => l.trim().slice(2)).map(l => {
                const m = l.match(/^([A-Z])\s+([^:：]+)[:：]\s*(.*)$/);
                return m ? { key: m[1], name: m[2].trim(), body: m[3] } : { key: '', name: '', body: l };
            });
            const list = <ul className="store-methods" key={k}>{items.map((it, j) => <li key={j}>{it.key && <b>{it.key}</b>}<div>{it.name && <strong>{it.name}</strong>}<p>{it.body}</p></div></li>)}</ul>;
            // 방식 설명 바로 아래에 원본 ↔ 변형 예시
            if (!placed && children) { placed = true; return <div key={k}>{list}{children}</div>; }
            return list;
        }
        const use = b.match(/^(이렇게 쓰세요\.)\s*([\s\S]*)$/);
        if (use) return <p key={k} className="store-howto"><strong>{use[1]}</strong> {use[2]}</p>;
        return <p key={k} className="store-preline">{b}</p>;
    })}{!placed && children}</>;
}
