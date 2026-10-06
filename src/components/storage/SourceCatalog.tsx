"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import type { UserItem } from '@/types/storage';
import { sourceCategory, sourceCategories, type SourceCategory } from '@/lib/questions/source-category';

/**
 * 출제 자료 고르기(10/7 다시 짬). 예전엔 고1학년 › … 폴더를 파고 들어가야 해서 '너무 불편'(사용자).
 * 이제: 학교 이름 검색 + 지역·학년·연도·시험·과목 거르기 → 학교별로 묶인 회차를 눌러 담는다.
 * 부모(page.tsx)와 주고받는 것은 예전과 같다: onItemSelect(한 개 토글) · onGroupSelect(여러 개) · onGetViewItems(보이는 목록).
 */
const REGION_ORDER = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
const TERMS = [
    { id: '1-중간', label: '1학기 중간' }, { id: '1-기말', label: '1학기 기말' },
    { id: '2-중간', label: '2학기 중간' }, { id: '2-기말', label: '2학기 기말' },
];
const termOf = (d: any) => `${d.semester || ''}-${String(d.exam_type || '').includes('중간') ? '중간' : String(d.exam_type || '').includes('기말') ? '기말' : ''}`;
const isMockLike = (d: any) => /모의|수능|학력평가|평가원/.test(String(d.exam_type || ''));
const examLabel = (item: UserItem) => {
    const d = item.details || {};
    if (d.private || !d.exam_year) return (item.name || '').replace(/\s*\[[^\]]*\]\s*$/, '');
    if (isMockLike(d)) return `${d.exam_year} 고${d.grade || ''} ${d.semester ? `${d.semester}월 ` : ''}${d.exam_type || ''}`.replace(/\s+/g, ' ').trim();
    const t = String(d.exam_type || '').includes('중간') ? '중간' : String(d.exam_type || '').includes('기말') ? '기말' : (d.exam_type || '');
    return `${d.exam_year} ${d.grade ? `${d.grade}학년 ` : ''}${d.semester ? `${d.semester}학기 ` : ''}${t}`.replace(/\s+/g, ' ').trim();
};
const sortItems = (a: UserItem, b: UserItem) => {
    const x = a.details || {}, y = b.details || {};
    return (y.exam_year || 0) - (x.exam_year || 0) || (x.grade || 0) - (y.grade || 0) || (x.semester || 0) - (y.semester || 0) || termOf(x).localeCompare(termOf(y));
};

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
    const [subject, setSubject] = useState('');
    const [open, setOpen] = useState<Set<string>>(new Set());
    const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

    const groupsByCat = useMemo(() => Object.fromEntries(sourceCategories.map(c =>
        [c.id, items.filter(item => sourceCategory(item.details || {}) === c.id)])) as Record<SourceCategory, UserItem[]>, [items]);
    // '내 개인DB' 칸은 전용 DB 가 있는 회원에게만 보이고, 있으면 처음에 그 칸을 연다 (10/6)
    const tabs = sourceCategories.filter(c => c.id !== 'mine' || groupsByCat.mine.length > 0);
    const openedMine = useRef(false);
    useEffect(() => {
        if (!openedMine.current && groupsByCat.mine.length > 0) { openedMine.current = true; setCategory('mine'); }
    }, [groupsByCat.mine.length]);

    const pool = groupsByCat[category];
    const isSchool = category === 'school';
    const opts = useMemo(() => {
        const uniq = (f: (d: any) => any) => Array.from(new Set(pool.map(i => f(i.details || {})).filter(v => v !== undefined && v !== null && v !== '')));
        return {
            regions: uniq(d => d.region).sort((a, b) => (REGION_ORDER.indexOf(a) + 1 || 99) - (REGION_ORDER.indexOf(b) + 1 || 99)),
            districts: uniq(d => (d.region === region ? d.district : '')).sort((a, b) => String(a).localeCompare(String(b), 'ko')),
            grades: uniq(d => d.grade).sort((a, b) => a - b),
            years: uniq(d => d.exam_year).sort((a, b) => b - a),
            subjects: uniq(d => d.subject).sort((a, b) => String(a).localeCompare(String(b), 'ko')),
        };
    }, [pool, region]);

    const visible = useMemo(() => {
        const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        return pool.filter(item => {
            const d = item.details || {};
            if (region && d.region !== region) return false;
            if (district && d.district !== district) return false;
            if (grade && String(d.grade) !== grade) return false;
            if (year && String(d.exam_year) !== year) return false;
            if (term && termOf(d) !== term) return false;
            if (subject && d.subject !== subject) return false;
            const hay = `${item.name} ${d.school || ''} ${d.region || ''} ${d.district || ''}`.toLocaleLowerCase();
            return words.every(w => hay.includes(w));
        });
    }, [pool, search, region, district, grade, year, term, subject]);

    // 학교(같은 이름이면 지역까지)로 묶는다
    const schools = useMemo(() => {
        const map = new Map<string, { key: string; name: string; where: string; items: UserItem[] }>();
        for (const item of visible) {
            const d = item.details || {};
            const name = d.private ? '내 개인DB' : (d.school || '기타');
            const key = `${name}|${d.region || ''}|${d.district || ''}`;
            if (!map.has(key)) map.set(key, { key, name, where: [d.region, d.district].filter(Boolean).join(' '), items: [] });
            map.get(key)!.items.push(item);
        }
        return Array.from(map.values()).map(g => ({ ...g, items: g.items.sort(sortItems) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    }, [visible]);
    const autoOpen = schools.length <= 6;

    const report = useRef(onGetViewItems);
    report.current = onGetViewItems;
    useEffect(() => { report.current(visible); }, [visible]);

    const filtered = !!(search || region || district || grade || year || term || subject);
    const resetFilters = () => { setSearch(''); setRegion(''); setDistrict(''); setGrade(''); setYear(''); setTerm(''); setSubject(''); };
    const chosen = useMemo(() => items.filter(i => selected.has(i.id)), [items, selected]);
    const visibleSelected = visible.filter(i => selected.has(i.id)).length;
    const toggleOpen = (key: string) => setOpen(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    const schoolLabel = (g: { name: string; where: string }) => g.name;

    return <section className="rd-cat" aria-label="출제 자료 고르기">
        <div className="rd-seg rd-cat-tabs" role="group" aria-label="자료 종류">
            {tabs.map(c => <button key={c.id} type="button" aria-pressed={category === c.id}
                onClick={() => { setCategory(c.id); resetFilters(); setOpen(new Set()); }}>
                {c.label}<small>{groupsByCat[c.id].length}개</small>
            </button>)}
        </div>

        <div className="rd-cat-search">
            <Search size={18} aria-hidden="true" />
            <input aria-label="학교 이름으로 찾기" placeholder={isSchool ? '학교 이름으로 찾기 (예: 휘문)' : '이름이나 연도로 찾기'} value={search} onChange={e => setSearch(e.target.value)} autoComplete="off" />
            {search && <button type="button" aria-label="검색어 지우기" onClick={() => setSearch('')}><X size={16} /></button>}
        </div>

        <div className="rd-cat-filters" role="group" aria-label="거르기">
            {isSchool && opts.regions.length > 1 && <select aria-label="시도" value={region} onChange={e => { setRegion(e.target.value); setDistrict(''); }}>
                <option value="">전국</option>{opts.regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>}
            {isSchool && region && <select aria-label="구군" value={district} onChange={e => setDistrict(e.target.value)}>
                <option value="">{region} 전체</option>{opts.districts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>}
            {opts.grades.length > 1 && <select aria-label="학년" value={grade} onChange={e => setGrade(e.target.value)}>
                <option value="">모든 학년</option>{opts.grades.map(g => <option key={g} value={String(g)}>{g}학년</option>)}
            </select>}
            {opts.years.length > 1 && <select aria-label="연도" value={year} onChange={e => setYear(e.target.value)}>
                <option value="">모든 연도</option>{opts.years.map(y => <option key={y} value={String(y)}>{y}년</option>)}
            </select>}
            {isSchool && <select aria-label="시험" value={term} onChange={e => setTerm(e.target.value)}>
                <option value="">모든 시험</option>{TERMS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>}
            {opts.subjects.length > 1 && <select aria-label="과목" value={subject} onChange={e => setSubject(e.target.value)}>
                <option value="">모든 과목</option>{opts.subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>}
            {filtered && <button type="button" className="rd-cat-reset" onClick={resetFilters}>조건 지우기</button>}
        </div>

        {chosen.length > 0 && <div className="rd-cat-chosen" aria-label="고른 자료">
            <span>고른 자료 {chosen.length}개</span>
            <div>{chosen.slice(0, 12).map(i => <button key={i.id} type="button" onClick={() => onItemSelect(i)} title="빼기">
                {(i.details?.school || '').replace(/고등학교$/, '고')} {examLabel(i)}<X size={13} aria-hidden="true" />
            </button>)}{chosen.length > 12 && <em>외 {chosen.length - 12}개</em>}</div>
            <button type="button" className="rd-cat-clear" onClick={() => onGroupSelect(chosen, false)}>모두 빼기</button>
        </div>}

        <div className="rd-cat-bar">
            <p role="status">{filtered ? `조건에 맞는 자료 ${visible.length}개` : `${sourceCategories.find(c => c.id === category)?.label} 자료 ${visible.length}개`}{isSchool && schools.length > 0 ? `, ${schools.length}개 학교` : ''}</p>
            {filtered && visible.length > 0 && visible.length <= 300 && (visibleSelected === visible.length
                ? <button type="button" onClick={() => onGroupSelect(visible, false)}>보이는 자료 모두 빼기</button>
                : <button type="button" onClick={() => onGroupSelect(visible.filter(i => !selected.has(i.id)), true)}>보이는 자료 {visible.length}개 모두 담기</button>)}
        </div>

        <div className="rd-cat-list">
            {schools.length === 0 ? <p className="rd-cat-empty">조건에 맞는 자료가 없습니다. 검색어나 거르기 조건을 바꿔 보세요.</p>
                : schools.map(g => {
                    const isOpen = autoOpen || open.has(g.key);
                    const n = g.items.filter(i => selected.has(i.id)).length;
                    const all = n === g.items.length;
                    return <div key={g.key} className={`rd-cat-school ${n ? 'has-pick' : ''}`}>
                        <div className="rd-cat-head">
                            <button type="button" className="rd-cat-name" aria-expanded={isOpen} onClick={() => toggleOpen(g.key)}>
                                {isOpen ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
                                <b>{schoolLabel(g)}</b>{g.where && <small>{g.where}</small>}
                                <span className="rd-cat-count">{n ? `${n}/${g.items.length}개 고름` : `${g.items.length}개`}</span>
                            </button>
                            <button type="button" className={`rd-cat-all ${all ? 'is-on' : ''}`} onClick={() => onGroupSelect(all ? g.items : g.items.filter(i => !selected.has(i.id)), !all)}>
                                {all ? '학교 빼기' : '학교 전체'}
                            </button>
                        </div>
                        {isOpen && <div className="rd-cat-exams">
                            {g.items.map(i => {
                                const on = selected.has(i.id);
                                return <button key={i.id} type="button" role="checkbox" aria-checked={on} className={`rd-cat-exam ${on ? 'is-on' : ''}`} onClick={() => onItemSelect(i)}>
                                    <span className="rd-cat-box" aria-hidden="true">{on && <Check size={13} strokeWidth={3} />}</span>
                                    <span>{examLabel(i)}{i.details?.subject && <small>{i.details.subject}</small>}</span>
                                </button>;
                            })}
                        </div>}
                    </div>;
                })}
        </div>
    </section>;
}
