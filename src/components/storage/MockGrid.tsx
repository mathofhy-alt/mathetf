"use client";

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
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
    const t = String(i.name || '').match(/(?:모의고사|입학시험)\s*(.*?)\s*\[/)?.[1] || '';
    let v = t || (d.subject && !['전과정', '전과목'].includes(d.subject) ? d.subject : '');
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

export default function MockGrid({ kind, pool, selectedIds, onGroupSelect, cart, cartIds, onToggleQuestion, onAddQuestions }: {
    kind: 'national' | 'special';
    pool: UserItem[];
    selectedIds: Set<string>;
    onGroupSelect: (items: UserItem[], select: boolean) => void;
    cart?: any[];
    cartIds?: Set<string>;
    onToggleQuestion?: (q: Q) => void;
    onAddQuestions?: (qs: Q[]) => void;
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

    useEffect(() => {
        if (!curId || rounds[curId]) return;
        setRounds(r => ({ ...r, [curId]: 'loading' }));
        fetch('/api/questions/search', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selectedDbs: [curId], purchasedDbsCount: 0, advancedFilters: { includeOffCurriculum: true }, page: 1 }),
        }).then(r => r.json()).then(j => {
            if (!j?.success) throw new Error(j?.error || 'fail');
            setRounds(r => ({ ...r, [curId]: (j.data || []).map((q: Q) => ({ ...q, question_images: null })) }));
        }).catch(() => setRounds(r => ({ ...r, [curId]: 'error' })));
    }, [curId, rounds]);

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
