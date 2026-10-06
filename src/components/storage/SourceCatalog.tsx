"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import type { UserItem } from '@/types/storage';
import { sourceCategory, sourceCategories, type SourceCategory } from '@/lib/questions/source-category';

/**
 * 출제 자료 고르기(10/7 다시 짬). 예전엔 고1학년 › … 폴더를 파고 들어가야 해서 '너무 불편'(사용자).
 * · 내신: 학교 이름 검색, 또는 지역 → 구·군 단추로 좁혀 학교별 회차를 눌러 담는다(원본 제보 창과 같은 순서).
 * · 사관/경대: '2025학년도 사관학교' 묶음에 과목을 담는다(지역 없음 — 자료의 지역 값은 의미 없다).
 * · 전국연합: '2024년 고3 11월 수능' 묶음에 과목을 담는다.
 * 부모(page.tsx)와 주고받는 것은 예전과 같다: onItemSelect(한 개 토글) · onGroupSelect(여러 개) · onGetViewItems(보이는 목록).
 */
const REGION_ORDER = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
const TERMS = [
    { id: '1-중간', label: '1학기 중간' }, { id: '1-기말', label: '1학기 기말' },
    { id: '2-중간', label: '2학기 중간' }, { id: '2-기말', label: '2학기 기말' },
];
const termOf = (d: any) => `${d.semester || ''}-${String(d.exam_type || '').includes('중간') ? '중간' : String(d.exam_type || '').includes('기말') ? '기말' : ''}`;
const shortType = (t: string) => (t.includes('중간') ? '중간' : t.includes('기말') ? '기말' : t);
const nationalName = (school: string) => (school === '수능' ? '수능' : school === '평가원' ? '평가원 모의평가' : '전국연합 학력평가');

type Group = { key: string; title: string; sub: string; sort: string; items: UserItem[] };

export default function SourceCatalog({ items, selectedIds, onItemSelect, onGroupSelect, onGetViewItems }: {
    items: UserItem[]; selectedIds: string[];
    onItemSelect: (item: UserItem) => void;
    onGroupSelect: (items: UserItem[], select: boolean) => void;
    onGetViewItems: (items: UserItem[]) => void;
}) {
    const [category, setCategory] = useState<SourceCategory>('school');
    const [search, setSearch] = useState('');
    const [region, setRegion] = useState('');
    const [district, setDistrict] = useState('');
    const [grade, setGrade] = useState('');
    const [year, setYear] = useState('');
    const [term, setTerm] = useState('');
    const [month, setMonth] = useState('');
    const [subject, setSubject] = useState('');
    const [open, setOpen] = useState<Set<string>>(new Set());
    const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

    const byCat = useMemo(() => Object.fromEntries(sourceCategories.map(c =>
        [c.id, items.filter(item => sourceCategory(item.details || {}) === c.id)])) as Record<SourceCategory, UserItem[]>, [items]);
    // '내 개인DB' 칸은 전용 DB 가 있는 회원에게만 보이고, 있으면 처음에 그 칸을 연다 (10/6)
    const tabs = sourceCategories.filter(c => c.id !== 'mine' || byCat.mine.length > 0);
    const openedMine = useRef(false);
    useEffect(() => {
        if (!openedMine.current && byCat.mine.length > 0) { openedMine.current = true; setCategory('mine'); }
    }, [byCat.mine.length]);

    const pool = byCat[category];
    const isSchool = category === 'school';
    const isNational = category === 'national';
    const uniq = (list: UserItem[], f: (d: any) => any) => Array.from(new Set(list.map(i => f(i.details || {})).filter(v => v !== undefined && v !== null && v !== '')));

    // 지역·구군을 뺀 나머지 조건(학년·연도·시험·월·과목·검색어)
    const matchesRest = (item: UserItem, words: string[]) => {
        const d = item.details || {};
        if (grade && String(d.grade) !== grade) return false;
        if (year && String(d.exam_year) !== year) return false;
        if (term && termOf(d) !== term) return false;
        if (month && String(d.semester) !== month) return false;
        if (subject && d.subject !== subject) return false;
        const hay = `${item.name || ''} ${d.school || ''} ${isSchool ? `${d.region || ''} ${d.district || ''}` : ''}`.toLocaleLowerCase();
        return words.every(w => hay.includes(w));
    };
    const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const restPool = useMemo(() => pool.filter(i => matchesRest(i, words)), // eslint-disable-next-line react-hooks/exhaustive-deps
        [pool, search, grade, year, term, month, subject]);

    // 내신은 검색어가 없으면 지역 → 구·군을 먼저 고르게 한다(330개 학교 목록을 통째로 내밀지 않는다)
    const browsing = isSchool && !words.length;
    const regionCounts = useMemo(() => {
        const m = new Map<string, Set<string>>();
        for (const i of restPool) { const d = i.details || {}; if (!d.region) continue; (m.get(d.region) || m.set(d.region, new Set()).get(d.region)!).add(d.school); }
        return Array.from(m, ([r, s]) => ({ r, n: s.size })).sort((a, b) => (REGION_ORDER.indexOf(a.r) + 1 || 99) - (REGION_ORDER.indexOf(b.r) + 1 || 99));
    }, [restPool]);
    const districtCounts = useMemo(() => {
        const m = new Map<string, Set<string>>();
        for (const i of restPool) { const d = i.details || {}; if (d.region !== region || !d.district) continue; (m.get(d.district) || m.set(d.district, new Set()).get(d.district)!).add(d.school); }
        return Array.from(m, ([r, s]) => ({ r, n: s.size })).sort((a, b) => a.r.localeCompare(b.r, 'ko'));
    }, [restPool, region]);
    // [10/7] 시험 범위로 한 번에 담기 — 회원 시험지 570개 중 36%가 학교 5곳 이상, 29%가 자료 21개 이상을 담았다.
    //   학교보다 '학년·학기·시험 범위'로 모으는 사람이 셋 중 하나라, 지역보다 앞에 둔다.
    const rangeMode = browsing && !region && !!grade && !!term;
    const ranges = useMemo(() => {
        const m = new Map<string, { grade: number; term: string; n: number; schools: Set<string> }>();
        for (const i of pool) {
            const d = i.details || {};
            const t = termOf(d);
            if (!d.grade || !TERMS.some(x => x.id === t)) continue;
            if (year && String(d.exam_year) !== year) continue;
            if (subject && d.subject !== subject) continue;
            const k = `${d.grade}|${t}`;
            if (!m.has(k)) m.set(k, { grade: d.grade, term: t, n: 0, schools: new Set() });
            const r = m.get(k)!; r.n++; r.schools.add(d.school);
        }
        return Array.from(m.values()).sort((a, b) => a.grade - b.grade || TERMS.findIndex(x => x.id === a.term) - TERMS.findIndex(x => x.id === b.term));
    }, [pool, year, subject]);
    const termLabel = (t: string) => TERMS.find(x => x.id === t)?.label || t;
    const showList = !browsing || rangeMode || !!district || district === '*';

    const visible = useMemo(() => restPool.filter(i => {
        if (!isSchool || words.length || rangeMode) return true;
        const d = i.details || {};
        if (region && d.region !== region) return false;
        if (district && district !== '*' && d.district !== district) return false;
        return !!region;
    }), [restPool, isSchool, words.length, region, district, rangeMode]);

    const groups: Group[] = useMemo(() => {
        const map = new Map<string, Group>();
        for (const item of visible) {
            const d = item.details || {};
            let key: string, title: string, sub = '', sort: string;
            if (d.private) { key = 'mine'; title = '내 개인DB'; sort = '0'; }
            else if (category === 'special') { key = `${d.school}|${d.exam_year}`; title = `${d.exam_year}학년도 ${d.school}`; sort = `${9999 - (d.exam_year || 0)}|${d.school}`; }
            else if (isNational) {
                key = `${d.exam_year}|${d.grade}|${d.semester}|${d.school}`;
                title = `${d.exam_year}년 고${d.grade} ${d.semester}월 ${nationalName(d.school)}`;
                sort = `${9999 - (d.exam_year || 0)}|${99 - (d.grade || 0)}|${99 - (d.semester || 0)}`;
            } else {
                key = `${d.school}|${d.region || ''}|${d.district || ''}`; title = d.school || '기타';
                sub = [d.region, d.district].filter(Boolean).join(' '); sort = title;
            }
            if (!map.has(key)) map.set(key, { key, title, sub, sort, items: [] });
            map.get(key)!.items.push(item);
        }
        const out = Array.from(map.values());
        for (const g of out) g.items.sort((a, b) => {
            const x = a.details || {}, y = b.details || {};
            return (y.exam_year || 0) - (x.exam_year || 0) || (x.grade || 0) - (y.grade || 0) || (x.semester || 0) - (y.semester || 0) || termOf(x).localeCompare(termOf(y)) || String(x.subject || '').localeCompare(String(y.subject || ''), 'ko');
        });
        return out.sort((a, b) => a.sort.localeCompare(b.sort, 'ko'));
    }, [visible, category, isNational]);

    // 칩(회차) 이름 — 묶음 제목에 이미 있는 말은 빼고 남는 것만
    const chipLabel = (item: UserItem): [string, string] => {
        const d = item.details || {};
        if (d.private || !d.exam_year) return [(item.name || '').replace(/\s*\[[^\]]*\]\s*$/, ''), ''];
        if (!isSchool) return [d.subject === '전과정' ? '전 범위' : (d.subject || '수학'), ''];
        return [`${d.exam_year} ${d.grade ? `${d.grade}학년 ` : ''}${d.semester ? `${d.semester}학기 ` : ''}${shortType(String(d.exam_type || ''))}`.replace(/\s+/g, ' ').trim(), d.subject || ''];
    };

    const report = useRef(onGetViewItems);
    report.current = onGetViewItems;
    useEffect(() => { report.current(visible); }, [visible]);

    const extraFiltered = !!(grade || year || term || month || subject);
    const resetAll = () => { setSearch(''); setRegion(''); setDistrict(''); setGrade(''); setYear(''); setTerm(''); setMonth(''); setSubject(''); setOpen(new Set()); };
    const chosen = useMemo(() => items.filter(i => selected.has(i.id)), [items, selected]);
    const visibleSelected = visible.filter(i => selected.has(i.id)).length;
    const autoOpen = groups.length <= 6;
    const toggleOpen = (key: string) => setOpen(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    const chosenLabel = (i: UserItem) => {
        const d = i.details || {};
        if (sourceCategory(d) === 'school') return `${String(d.school || '').replace(/고등학교$/, '고')} ${chipLabel(i)[0]}`;
        if (sourceCategory(d) === 'national') return `${d.exam_year} 고${d.grade} ${d.semester}월 ${d.subject === '전과정' ? '' : d.subject || ''}`.trim();
        if (sourceCategory(d) === 'special') return `${d.exam_year} ${String(d.school || '').replace(/학교$/, '')} ${d.subject || ''}`.trim();
        return (i.name || '').replace(/\s*\[[^\]]*\]\s*$/, '');
    };

    return <section className="rd-cat" aria-label="출제 자료 고르기">
        <div className="rd-seg rd-cat-tabs" role="group" aria-label="자료 종류">
            {tabs.map(c => <button key={c.id} type="button" aria-pressed={category === c.id}
                onClick={() => { setCategory(c.id); resetAll(); }}>
                {c.label}<small>{byCat[c.id].length}개</small>
            </button>)}
        </div>

        <div className="rd-cat-search">
            <Search size={18} aria-hidden="true" />
            <input aria-label="자료 찾기" placeholder={isSchool ? '학교 이름으로 찾기 (예: 휘문)' : '연도나 과목으로 찾기 (예: 2024 미적분)'} value={search} onChange={e => setSearch(e.target.value)} autoComplete="off" />
            {search && <button type="button" aria-label="검색어 지우기" onClick={() => setSearch('')}><X size={16} /></button>}
        </div>

        <div className="rd-cat-filters" role="group" aria-label="거르기">
            {uniq(pool, d => d.grade).length > 1 && <select aria-label="학년" value={grade} onChange={e => setGrade(e.target.value)}>
                <option value="">모든 학년</option>{uniq(pool, d => d.grade).sort((a, b) => a - b).map(g => <option key={g} value={String(g)}>{isSchool ? `${g}학년` : `고${g}`}</option>)}
            </select>}
            <select aria-label="연도" value={year} onChange={e => setYear(e.target.value)}>
                <option value="">모든 연도</option>{uniq(pool, d => d.exam_year).sort((a, b) => b - a).map(y => <option key={y} value={String(y)}>{y}년</option>)}
            </select>
            {isSchool && <select aria-label="시험" value={term} onChange={e => setTerm(e.target.value)}>
                <option value="">모든 시험</option>{TERMS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>}
            {isNational && <select aria-label="월" value={month} onChange={e => setMonth(e.target.value)}>
                <option value="">모든 달</option>{uniq(pool, d => d.semester).sort((a, b) => a - b).map(m => <option key={m} value={String(m)}>{m}월</option>)}
            </select>}
            {uniq(pool, d => d.subject).length > 1 && <select aria-label="과목" value={subject} onChange={e => setSubject(e.target.value)}>
                <option value="">모든 과목</option>{uniq(pool, d => d.subject).sort((a, b) => String(a).localeCompare(String(b), 'ko')).map(s => <option key={s} value={s}>{s}</option>)}
            </select>}
            {extraFiltered && <button type="button" className="rd-cat-reset" onClick={() => { setGrade(''); setYear(''); setTerm(''); setMonth(''); setSubject(''); }}>조건 지우기</button>}
        </div>

        {chosen.length > 0 && <div className="rd-cat-chosen" aria-label="고른 자료">
            <span>고른 자료 {chosen.length}개</span>
            <div>{chosen.slice(0, 12).map(i => <button key={i.id} type="button" onClick={() => onItemSelect(i)} title="빼기">
                {chosenLabel(i)}<X size={13} aria-hidden="true" />
            </button>)}{chosen.length > 12 && <em>외 {chosen.length - 12}개</em>}</div>
            <button type="button" className="rd-cat-clear" onClick={() => onGroupSelect(chosen, false)}>모두 빼기</button>
        </div>}

        {/* 내신: 지역 → 구·군 */}
        {browsing && (region || rangeMode) && <nav className="rd-cat-crumb" aria-label="지역">
            <button type="button" onClick={() => { setRegion(''); setDistrict(''); setGrade(''); setTerm(''); }} aria-current={!region && !rangeMode ? 'true' : undefined}>처음으로</button>
            {rangeMode && <><ChevronRight size={14} aria-hidden="true" /><span aria-current="true">전국 {grade}학년 {termLabel(term)}</span></>}
            {region && <><ChevronRight size={14} aria-hidden="true" /><button type="button" onClick={() => setDistrict('')} aria-current={region && !district ? 'true' : undefined}>{region}</button></>}
            {district && <><ChevronRight size={14} aria-hidden="true" /><span aria-current="true">{district === '*' ? `${region} 전체` : district}</span></>}
        </nav>}

        {browsing && !region && !rangeMode ? <div className="rd-cat-list">
            <p className="rd-cat-sec"><b>시험 범위로 한 번에 담기</b><small>범위를 고르면 전국 학교의 그 시험 회차가 모입니다{year ? ` (${year}년)` : ''}</small></p>
            <div className="rd-cat-places is-range">
                {ranges.map(r => <button key={`${r.grade}|${r.term}`} type="button" onClick={() => { setGrade(String(r.grade)); setTerm(r.term); }}>
                    <b>{r.grade}학년 {termLabel(r.term)}</b><small>학교 {r.schools.size}곳, 회차 {r.n}개</small>
                </button>)}
            </div>
            <p className="rd-cat-sec"><b>지역으로 학교 찾기</b></p>
            <div className="rd-cat-places">
                {regionCounts.map(({ r, n }) => <button key={r} type="button" onClick={() => setRegion(r)}><b>{r}</b><small>{n}개 학교</small></button>)}
            </div>
        </div>
        : browsing && region && !district ? <div className="rd-cat-list"><div className="rd-cat-places">
            <button type="button" className="is-all" onClick={() => setDistrict('*')}><b>{region} 전체</b><small>{regionCounts.find(x => x.r === region)?.n || 0}개 학교</small></button>
            {districtCounts.map(({ r, n }) => <button key={r} type="button" onClick={() => setDistrict(r)}><b>{r}</b><small>{n}개 학교</small></button>)}
        </div></div>
        : showList && <>
            <div className={`rd-cat-bar ${rangeMode ? 'is-range' : ''}`}>
                <p role="status">{rangeMode ? <><b>전국 {grade}학년 {termLabel(term)}{year ? `, ${year}년` : ''}{subject ? `, ${subject}` : ''}</b> 학교 {groups.length}곳, 회차 {visible.length}개</> : <>자료 {visible.length}개{isSchool ? `, ${groups.length}개 학교` : ''}</>}</p>
                {visible.length > 0 && visible.length <= 1500 && (isSchool ? (words.length || district || extraFiltered) : true) && (visibleSelected === visible.length
                    ? <button type="button" onClick={() => onGroupSelect(visible, false)}>{rangeMode ? '이 범위 모두 빼기' : '보이는 자료 모두 빼기'}</button>
                    : <button type="button" onClick={() => onGroupSelect(visible.filter(i => !selected.has(i.id)), true)}>{rangeMode ? `이 범위 ${visible.length}개 모두 담기` : `보이는 자료 ${visible.length}개 모두 담기`}</button>)}
            </div>
            <div className="rd-cat-list">
                {groups.length === 0 ? <p className="rd-cat-empty">조건에 맞는 자료가 없습니다. 검색어나 거르기 조건을 바꿔 보세요.</p>
                    : groups.map(g => {
                        const isOpen = autoOpen || !isSchool || open.has(g.key);
                        const n = g.items.filter(i => selected.has(i.id)).length;
                        const all = n === g.items.length;
                        return <div key={g.key} className={`rd-cat-school ${n ? 'has-pick' : ''}`}>
                            <div className="rd-cat-head">
                                <button type="button" className="rd-cat-name" aria-expanded={isOpen} onClick={() => isSchool && toggleOpen(g.key)} style={isSchool ? undefined : { cursor: 'default' }}>
                                    {isSchool && (isOpen ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />)}
                                    <b>{g.title}</b>{g.sub && !(browsing && district && district !== '*') && <small>{g.sub}</small>}
                                    <span className="rd-cat-count">{n ? `${n}/${g.items.length}개 고름` : `${g.items.length}개`}</span>
                                </button>
                                {g.items.length > 1 && <button type="button" className={`rd-cat-all ${all ? 'is-on' : ''}`} onClick={() => onGroupSelect(all ? g.items : g.items.filter(i => !selected.has(i.id)), !all)}>
                                    {all ? '모두 빼기' : '모두 담기'}
                                </button>}
                            </div>
                            {isOpen && <div className={`rd-cat-exams ${isSchool ? '' : 'is-compact'}`}>
                                {g.items.map(i => {
                                    const on = selected.has(i.id);
                                    const [label, small] = chipLabel(i);
                                    return <button key={i.id} type="button" role="checkbox" aria-checked={on} className={`rd-cat-exam ${on ? 'is-on' : ''}`} onClick={() => onItemSelect(i)}>
                                        <span className="rd-cat-box" aria-hidden="true">{on && <Check size={13} strokeWidth={3} />}</span>
                                        <span>{label}{small && <small>{small}</small>}</span>
                                    </button>;
                                })}
                            </div>}
                        </div>;
                    })}
            </div>
        </>}
    </section>;
}
