"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { parseMockQuery, type MockQuery } from '@/lib/questions/mockQuery';
import type { UserItem } from '@/types/storage';

/**
 * 모의고사·수능 / 사관·경찰대 고르기 (10/11 개편 — 시안: 기출 자료 선택 창 개편).
 * 계기: 회원(wipiwipi)이 여러 회차에서 번호를 골라 한 장으로 만들려다 1~4문항짜리 시험지를 7개 만들고 건의.
 *   사용자: "저 사람 잘못이 아니라 우리 기출 보여주는 형식이 잘못됐다."
 * · 학년(모의고사) → 연도 × 월 표, 사관·경찰대는 연도 × 시험 표. 칸 하나 = 시험 한 회차.
 * · 칸을 누르면 그 회차 문항 번호가 펼쳐지고, 번호를 누르면 장바구니에 바로 담긴다(검색 단계 없음).
 *   문항은 /api/questions/search 에 회차 하나만 넘겨 받는다(번호순, 회차당 30문항 안팎 < 한 페이지 50).
 * · '검색 범위로 고르기'는 예전 흐름(회차를 범위로 골라 단원·난이도로 검색)을 그대로 남긴 것.
 */
type Q = { id: string; question_number: number; [k: string]: any };
type Col = { key: string; label: string; order: number };

const dbIdOf = (i: UserItem) => i.reference_id || i.id;
const variantOf = (i: UserItem) => {
    const d = i.details || {};
    // 형·과목은 자료의 원래 제목('… 모의고사 A형 [개인DB]')에 있다 — 창이 화면용으로 새로 만든 name 에는 없다
    const whole = (s: string) => ['전과정', '전과목', '수학'].includes(s.trim());
    const t = String(d.title || i.name || '').match(/(?:모의고사|입학시험)\s*(.*?)\s*\[/)?.[1] || '';
    let v = (t && !whole(t) ? t : '') || (d.subject && !whole(d.subject) ? d.subject : '');
    // 2021학년도 이후 고3 선택과목은 옛 이름(미적분II·기하와벡터)으로 저장돼 있다 — 보이는 이름만 바로잡는다
    v = v.replace(/미적분II$/, '미적분').replace(/기하와벡터$/, '기하');
    return v || '전 범위';
};

function nationalCol(d: any): Col {
    const m = Number(d.semester) || 0;
    if (d.school === '수능') return { key: 'su', label: '수능', order: 13 };
    if (d.school === '평가원') return { key: `p${m}`, label: `${m}월 모평`, order: m + 0.5 };
    if (Number(d.grade) < 3 && (m === 10 || m === 11)) return { key: 'n1011', label: '10·11월', order: 10.5 };
    if (Number(d.grade) === 3 && (m === 4 || m === 5)) return { key: 'n45', label: '4·5월', order: 4.5 };
    return { key: `n${m}`, label: `${m}월`, order: m };
}
function specialCol(i: UserItem): Col {
    const d = i.details || {};
    if (/경찰/.test(d.school || '')) return { key: 'police', label: '경찰대', order: 9 };
    const v = variantOf(i);
    const order = /확률/.test(v) ? 1 : /미적/.test(v) ? 2 : /기하/.test(v) ? 3 : 4;
    return { key: `sg-${v}`, label: `사관 ${v}`, order };
}

export default function MockGrid({ kind, pool, selectedIds, onGroupSelect, cart, cartIds, onToggleQuestion, onAddQuestions, initialQuery, onOtherKind }: {
    kind: 'national' | 'special';
    pool: UserItem[];
    selectedIds: Set<string>;
    onGroupSelect: (items: UserItem[], select: boolean) => void;
    cart?: any[];
    cartIds?: Set<string>;
    onToggleQuestion?: (q: Q) => void;
    onAddQuestions?: (qs: Q[]) => number | void;   // 실제로 담긴 개수(장바구니가 가득 차면 일부만)
    initialQuery?: string;                                              // 다른 탭에서 넘어온 '번호로 바로 찾기' 입력
    onOtherKind?: (kind: 'national' | 'special', text: string) => void;
}) {
    const grades = useMemo(() => Array.from(new Set(pool.map(i => Number(i.details?.grade)).filter(Boolean))).sort(), [pool]);
    const [grade, setGrade] = useState<number>(() => (grades.includes(2) ? 2 : grades[0] || 3));
    const [openCell, setOpenCell] = useState<string>('');
    const [variant, setVariant] = useState<string>('');
    const [rounds, setRounds] = useState<Record<string, Q[] | 'loading' | 'error'>>({});

    const { cols, years, cells } = useMemo(() => {
        const shown = kind === 'national' ? pool.filter(i => Number(i.details?.grade) === grade) : pool;
        const cm = new Map<string, Col>(); const cellMap = new Map<string, UserItem[]>(); const ys = new Set<number>();
        for (const i of shown) {
            const c = kind === 'national' ? nationalCol(i.details || {}) : specialCol(i);
            const y = Number(i.details?.exam_year); if (!y) continue;
            cm.set(c.key, c); ys.add(y);
            const k = `${y}|${c.key}`; (cellMap.get(k) || cellMap.set(k, []).get(k)!).push(i);
        }
        return { cols: Array.from(cm.values()).sort((a, b) => a.order - b.order), years: Array.from(ys).sort((a, b) => b - a), cells: cellMap };
    }, [pool, grade, kind]);

    const cellItems = openCell ? (cells.get(openCell) || []) : [];
    const variants = cellItems.map(i => ({ item: i, label: variantOf(i) }));
    const cur = variants.find(v => dbIdOf(v.item) === variant) || variants[0];
    const curId = cur ? dbIdOf(cur.item) : '';
    const qs = curId ? rounds[curId] : undefined;

    // 회차 문항 불러오기 — 칸 열기와 '번호로 바로 찾기'가 같이 쓴다(같은 회차는 한 번만 받는다)
    const loading = useRef<Record<string, Promise<Q[]>>>({});
    const loadRound = (id: string): Promise<Q[]> => {
        if (!loading.current[id]) {
            setRounds(r => ({ ...r, [id]: 'loading' }));
            loading.current[id] = fetch('/api/questions/search', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selectedDbs: [id], purchasedDbsCount: 0, advancedFilters: { includeOffCurriculum: true }, page: 1 }),
            }).then(r => r.json()).then(j => {
                if (!j?.success) throw new Error(j?.error || 'fail');
                const list: Q[] = (j.data || []).map((q: Q) => ({ ...q, question_images: null }));
                setRounds(r => ({ ...r, [id]: list }));
                return list;
            }).catch(e => { delete loading.current[id]; setRounds(r => ({ ...r, [id]: 'error' })); throw e; });
        }
        return loading.current[id];
    };
    useEffect(() => { if (curId && !rounds[curId]) loadRound(curId).catch(() => { }); }, [curId, rounds]);   // eslint-disable-line react-hooks/exhaustive-deps

    // ── 번호로 바로 찾기 ── 짐작으로 담지 않는다: 회차가 없거나 과목이 필요한데 없으면 이유만 알리고 그 칸을 열어 둔다
    const [query, setQuery] = useState(initialQuery || '');
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const cellKeyOf = (i: UserItem) => `${i.details?.exam_year}|${(kind === 'national' ? nationalCol(i.details || {}) : specialCol(i)).key}`;
    const matchRound = (q: MockQuery): { items: UserItem[]; why?: string } => {
        if (q.kind === 'national') {
            if (q.grade === 1 && q.month === 3) return { items: [], why: '고1 3월 학력평가는 중학교 범위라 넣지 않았어요.' };
            const items = pool.filter(i => {
                const d = i.details || {};
                if (Number(d.exam_year) !== q.year || Number(d.grade) !== q.grade) return false;
                if (q.school === '수능') return d.school === '수능';
                if (Number(d.semester) !== q.month) return false;
                return !q.school || d.school === q.school;
            });
            return items.length ? { items } : { items, why: `${q.year}년 고${q.grade} ${q.school === '수능' ? '수능' : `${q.month}월`} 회차는 아직 없어요.` };
        }
        const police = q.school === '경찰대학교';
        const items = pool.filter(i => Number(i.details?.exam_year) === q.year && (police ? /경찰/ : /사관/).test(i.details?.school || ''));
        return items.length ? { items } : { items, why: `${q.year}학년도 ${police ? '경찰대' : '사관학교'} 회차는 아직 없어요.` };
    };
    const runQuery = async (text: string) => {
        const p = parseMockQuery(text);
        if (!p.ok) { setMsg({ ok: false, text: p.reason }); return; }
        const q = p.q;
        if (q.kind !== kind) { onOtherKind?.(q.kind, text); return; }
        const { items, why } = matchRound(q);
        if (!items.length) { setMsg({ ok: false, text: why || '그 회차를 찾지 못했어요.' }); return; }
        if (q.kind === 'national' && q.grade) setGrade(q.grade);
        let pick = items;
        if (q.subject) {
            pick = items.filter(i => variantOf(i).includes(q.subject!));
            if (!pick.length) {
                setOpenCell(cellKeyOf(items[0])); setVariant('');
                setMsg({ ok: false, text: `이 회차에는 '${q.subject}'은 없어요. 있는 것: ${items.map(variantOf).sort().join(' · ')}` });
                return;
            }
        }
        // 과목이 여럿인 회차: 공통 범위(1~22번)는 어느 과목 회차에나 같은 문항이 들어 있다 — 그 밖은 과목이 꼭 있어야 한다
        const electives = pick.length > 1 && pick.every(i => /확률|미적|기하/.test(variantOf(i)));
        if (pick.length > 1 && !(electives && q.nums.every(n => n <= 22))) {
            setOpenCell(cellKeyOf(pick[0])); setVariant('');
            const vs = pick.map(variantOf).sort();
            setMsg({ ok: false, text: `${vs.every(x => /형$/.test(x)) ? '유형' : '과목'}을 같이 적어 주세요: ${vs.join(' · ')} (예: ${text.trim()} ${vs[0]})` });
            return;
        }
        const target = pick[0];
        setOpenCell(cellKeyOf(target)); setVariant(dbIdOf(target)); setBusy(true);
        try {
            const list = await loadRound(dbIdOf(target));
            const found = q.nums.map(n => list.find(x => x.question_number === n)).filter(Boolean) as Q[];
            const missing = q.nums.filter(n => !list.some(x => x.question_number === n));
            const already = found.filter(x => cartIds?.has(x.id));
            const fresh = found.filter(x => !cartIds?.has(x.id));
            // 장바구니가 가득 차면 일부만 담긴다 — 실제로 담긴 개수로 안내한다
            const added = fresh.length ? (onAddQuestions?.(fresh) ?? fresh.length) : 0;
            if (added < fresh.length) fresh.splice(added);
            const v = variantOf(target);
            const name = q.kind === 'national'
                ? `${q.year}년 고${q.grade} ${q.school === '수능' || target.details?.school === '수능' ? '수능' : `${q.month}월${target.details?.school === '평가원' ? ' 모평' : ''}`}${pick.length > 1 ? ' 공통' : v !== '전 범위' ? ` ${v}` : ''}`
                : `${q.year}학년도 ${/경찰/.test(target.details?.school || '') ? '경찰대' : `사관 ${v}`}`;
            const parts: string[] = [];
            if (fresh.length) parts.push(`${fresh.map(x => x.question_number).join(', ')}번을 담았어요`);
            if (already.length) parts.push(`${already.map(x => x.question_number).join(', ')}번은 이미 담겨 있어요`);
            if (missing.length) parts.push(`${missing.join(', ')}번은 이 회차에 없어요`);
            setMsg({ ok: found.length > 0, text: `${name} — ${parts.join(' · ')}` });
            if (fresh.length) setQuery('');
        } catch {
            setMsg({ ok: false, text: '문항을 불러오지 못했어요. 잠시 후 다시 해 주세요.' });
        } finally { setBusy(false); }
    };
    const ranInitial = useRef(false);
    useEffect(() => { if (initialQuery && !ranInitial.current) { ranInitial.current = true; runQuery(initialQuery); } }, []);   // eslint-disable-line react-hooks/exhaustive-deps

    // 칸마다 '담음 N' — 모의고사는 장바구니 문항의 학교·연도·학년·월로 바로 센다(회차를 안 열어 봐도).
    //   사관은 공통 22문항이 세 과목 회차에 같이 들어 있어 문항만으로 과목 칸을 못 가른다 → 열어 본 회차 기준.
    const cartByCell = useMemo(() => {
        const m = new Map<string, number>();
        if (kind !== 'national') return m;
        for (const q of cart || []) {
            if (!q || !/전국연합|평가원|수능/.test(q.school || '')) continue;
            const g = Number(String(q.grade || '').replace(/[^0-9]/g, ''));
            if (g !== grade) continue;
            const k = `${q.year}|${nationalCol({ school: q.school, semester: parseInt(String(q.semester || ''), 10), grade: g }).key}`;
            m.set(k, (m.get(k) || 0) + 1);
        }
        return m;
    }, [cart, grade, kind]);
    const pickedIn = (items: UserItem[], key?: string) => {
        if (kind === 'national' && key) return cartByCell.get(key) || 0;
        let n = 0;
        for (const it of items) { const r = rounds[dbIdOf(it)]; if (Array.isArray(r)) n += r.filter(q => cartIds?.has(q.id)).length; }
        return n;
    };
    const [oy, ocol] = openCell.split('|');
    const colLabel = cols.find(c => c.key === ocol)?.label || '';
    const monthOfOpen = cellItems[0]?.details?.semester;
    const title = !openCell ? '' : kind === 'special'
        ? `${oy}학년도 ${/경찰/.test(colLabel) ? '경찰대학교' : `사관학교 · ${colLabel.replace('사관 ', '')}`}`
        : colLabel === '수능' ? `${oy}년 고3 수능`
        : / 모평$/.test(colLabel) ? `${oy}년 고3 ${monthOfOpen}월 평가원 모의평가`
        : `${oy}년 고${grade} ${monthOfOpen}월 전국연합`;
    const list = Array.isArray(qs) ? qs : [];
    const allIn = list.length > 0 && list.every(q => cartIds?.has(q.id));
    const inScope = cur ? selectedIds.has(dbIdOf(cur.item)) : false;

    return <div className="rd-mg">
        <form className="rd-mg-find" role="search" onSubmit={e => { e.preventDefault(); if (!busy) runQuery(query); }}>
            <Search size={18} aria-hidden="true" />
            <input aria-label="번호로 바로 찾기" value={query} onChange={e => { setQuery(e.target.value); setMsg(null); }} autoComplete="off"
                placeholder={kind === 'national' ? '번호로 바로 찾기 — 예: 2024 고2 9월 21번 · 2025 수능 28~30번' : '번호로 바로 찾기 — 예: 사관 2024 미적분 29번 · 경찰대 2023 25번'} />
            <button type="submit" disabled={busy || !query.trim()}>{busy ? '찾는 중…' : '담기'}</button>
        </form>
        {msg && <p role="status" className={`rd-mg-findmsg ${msg.ok ? 'is-ok' : 'is-no'}`}>{msg.text}</p>}
        {kind === 'national' && grades.length > 1 && <div className="rd-mg-grades" role="group" aria-label="학년">
            {grades.map(g => <button key={g} type="button" aria-pressed={grade === g} onClick={() => { setGrade(g); setOpenCell(''); }}>고{g}</button>)}
        </div>}
        <div className="rd-mg-body">
            <div className="rd-mg-table" role="grid" aria-label="회차 표">
                <div className="rd-mg-row is-head" style={{ gridTemplateColumns: `56px repeat(${cols.length}, minmax(0, 1fr))` }}>
                    <span />{cols.map(c => <span key={c.key}>{c.label}</span>)}
                </div>
                {years.map(y => <div key={y} className="rd-mg-row" style={{ gridTemplateColumns: `56px repeat(${cols.length}, minmax(0, 1fr))` }}>
                    <b>{y}</b>
                    {cols.map(c => {
                        const k = `${y}|${c.key}`; const its = cells.get(k);
                        if (!its) return <span key={c.key} className="rd-mg-none" aria-hidden="true" />;
                        const n = pickedIn(its, k); const scoped = its.some(i => selectedIds.has(dbIdOf(i)));
                        return <button key={c.key} type="button" aria-label={`${y} ${c.label}`}
                            className={`rd-mg-cell ${openCell === k ? 'is-open' : ''} ${n ? 'has-pick' : ''} ${scoped ? 'is-scope' : ''}`}
                            onClick={() => { setOpenCell(k); setVariant(''); }}>
                            {n ? `담음 ${n}` : c.label.replace(' 모평', '').replace('사관 ', '')}
                        </button>;
                    })}
                </div>)}
                {kind === 'national' && grade === 1 && <p className="rd-mg-note">고1 3월 학력평가는 중학교 범위라 넣지 않았어요.</p>}
            </div>

            <div className="rd-mg-panel">
                {!openCell ? <div className="rd-mg-empty"><b>표에서 회차를 누르세요</b><span>연도와 시험이 만나는 칸 하나가 시험 한 회차예요</span></div> : <>
                    <div className="rd-mg-ptitle">
                        <div><b>{title}</b><small>번호를 누르면 바로 담겨요 · 한 번 더 누르면 빠져요</small></div>
                        {list.length > 0 && <button type="button" className="rd-mg-all" onClick={() => allIn ? list.forEach(q => onToggleQuestion?.(q)) : onAddQuestions?.(list.filter(q => !cartIds?.has(q.id)))}>
                            {allIn ? '모두 빼기' : `${list.length}문항 전부`}
                        </button>}
                    </div>
                    {variants.length > 1 && <div className="rd-mg-variants" role="group" aria-label="과목·유형">
                        {variants.map(v => <button key={dbIdOf(v.item)} type="button" aria-pressed={dbIdOf(v.item) === curId} onClick={() => setVariant(dbIdOf(v.item))}>{v.label}</button>)}
                    </div>}
                    {qs === 'loading' || qs === undefined ? <p className="rd-mg-msg">문항을 불러오는 중…</p>
                        : qs === 'error' ? <p className="rd-mg-msg">문항을 불러오지 못했어요. 잠시 후 다시 눌러 주세요.</p>
                        : list.length === 0 ? <p className="rd-mg-msg">이 회차는 아직 문항이 없어요.</p>
                        : (kind === 'special' && !/경찰/.test(colLabel) ? [['공통 1–22번', list.filter(q => q.question_number <= 22)], [`선택 23–30번 · ${colLabel.replace('사관 ', '')}`, list.filter(q => q.question_number > 22)]] as [string, Q[]][] : [['', list]] as [string, Q[]][]).map(([head, part]) => <div key={head || 'all'}>
                            {head && <p className="rd-mg-part">{head}</p>}
                            <div className="rd-mg-nums">
                            {part.map(q => {
                                const on = !!cartIds?.has(q.id);
                                return <button key={q.id} type="button" aria-pressed={on} className={on ? 'is-on' : ''} onClick={() => onToggleQuestion?.(q)} title={q.unit || ''}>
                                    {q.question_number}{on && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                                </button>;
                            })}
                        </div></div>)}
                    {cur && <label className="rd-mg-scope">
                        <input type="checkbox" checked={inScope} onChange={() => onGroupSelect([cur.item], !inScope)} />
                        <span>이 회차를 검색 범위로도 쓰기 <small>(단원·난이도로 골라 찾을 때)</small></span>
                    </label>}
                </>}
            </div>
        </div>
    </div>;
}
