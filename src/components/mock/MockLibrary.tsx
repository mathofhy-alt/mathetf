"use client";
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import MockExamCard, { MockExam, MockCategory, MOCK_CATEGORIES } from './MockExamCard';

const ORDER: MockCategory[] = ['수능', '평가원', '전국연합', '경찰대', '사관학교'];

// 모의고사 허브의 종류 타일 + 찾기 + 회차 목록(10/7 새 디자인). 거르기는 클라이언트에서만.
export default function MockLibrary({ exams }: { exams: MockExam[] }) {
    const [category, setCategory] = useState('전체');
    const [grade, setGrade] = useState('');
    const [year, setYear] = useState('');
    const [query, setQuery] = useState('');
    const [shown, setShown] = useState(24);   // 600회차를 한 번에 펼치면 페이지가 3만 px — 나머지는 숨김만(검색엔진은 링크를 그대로 본다)
    const years = useMemo(() => [...new Set(exams.map(e => e.year))].sort((a, b) => b - a), [exams]);
    const grades = useMemo(() => [...new Set(exams.map(e => e.grade).filter(Boolean))].sort(), [exams]);
    const filtered = useMemo(() => exams.filter(e => (category === '전체' || e.category === category) && (!grade || e.grade === grade) && (!year || String(e.year) === year) && (!query.trim() || e.title.includes(query.trim())))
        .sort((a, b) => b.year - a.year || b.month - a.month), [exams, category, grade, year, query]);
    const filteredAny = category !== '전체' || grade || year || query;

    return <>
        <nav className="rd-mk-tiles" aria-label="모의고사 종류">
            {ORDER.map(key => <button key={key} type="button" aria-pressed={category === key} onClick={() => { setCategory(category === key ? '전체' : key); setShown(24); }}>
                <span className="rd-mk-glyph" aria-hidden="true">{MOCK_CATEGORIES[key].glyph}</span>
                <b>{MOCK_CATEGORIES[key].label}</b>
                <small>{exams.filter(e => e.category === key).length}회차</small>
            </button>)}
        </nav>

        <section className="rd-mk-browse" aria-label="모의고사 찾기">
            <div className="rd-mk-filter">
                <div className="rd-cat-search">
                    <Search size={18} aria-hidden="true" />
                    <input aria-label="모의고사 제목 검색" placeholder="시험 이름이나 월로 찾기 (예: 9월)" value={query} onChange={e => setQuery(e.target.value)} />
                    {query && <button type="button" aria-label="검색어 지우기" onClick={() => setQuery('')}><X size={16} /></button>}
                </div>
                <div className="rd-cat-filters">
                    <select aria-label="모의고사 학년" value={grade} onChange={e => setGrade(e.target.value)}><option value="">모든 학년</option>{grades.map(g => <option key={g}>{g}</option>)}</select>
                    <select aria-label="모의고사 연도" value={year} onChange={e => setYear(e.target.value)}><option value="">모든 연도</option>{years.map(y => <option key={y} value={y}>{y}년</option>)}</select>
                    {filteredAny && <button type="button" className="rd-cat-reset" onClick={() => { setCategory('전체'); setGrade(''); setYear(''); setQuery(''); }}>조건 지우기</button>}
                </div>
            </div>
            <div className="rd-mk-count" role="status">
                <span>{category === '전체' ? '전체' : category} {filtered.length}회차</span>
                {category !== '전체' && <Link href={`/모의고사/${category}`} className="rd-link">{category} 자료실과 출제 분석</Link>}
            </div>
            {filtered.length ? <><div className="rd-mk-grid">{filtered.map((exam, i) => <div key={exam.slug} hidden={i >= shown} className="rd-mk-cell"><MockExamCard exam={exam} /></div>)}</div>
                {filtered.length > shown && <button type="button" className="rd-btn rd-btn-gray rd-mk-more" onClick={() => setShown(n => n + 48)}>{Math.min(48, filtered.length - shown)}회차 더 보기 <small>남은 {filtered.length - shown}회차</small></button>}</>
                : <p className="rd-cat-empty">조건에 맞는 회차가 없습니다. 학년이나 연도를 바꿔 보세요.</p>}
        </section>
    </>;
}
