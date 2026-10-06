'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { schoolMatches } from '@/lib/discovery';

// 학교 목록(10/7 새 디자인) — 이름·초성 검색 + 시도 거르기. 주소에 ?q=·?region= 를 남겨 공유되게 한다.
export default function SchoolDirectory({ rows }: { rows: { name: string; region: string; count: number }[] }) {
    const [q, setQ] = useState(''), [region, setRegion] = useState('');
    useEffect(() => { const p = new URLSearchParams(window.location.search); setQ(p.get('q') || ''); setRegion(p.get('region') || ''); }, []);
    const regions = useMemo(() => [...new Set(rows.map(s => s.region.split(' ')[0]).filter(Boolean))].sort(), [rows]);
    const found = rows.filter(s => schoolMatches(s.name, q) && (!region || s.region.startsWith(region)));
    const update = (query: string, area: string) => {
        setQ(query); setRegion(area);
        const p = new URLSearchParams(); if (query) p.set('q', query); if (area) p.set('region', area);
        window.history.replaceState(null, '', `/schools${p.size ? '?' + p : ''}`);
    };
    return <section className="rd-sd" aria-label="학교 찾기">
        <div className="rd-mk-filter">
            <div className="rd-cat-search">
                <Search size={18} aria-hidden="true" />
                <input aria-label="학교명 또는 초성" value={q} onChange={e => update(e.target.value, region)} placeholder="학교 이름이나 초성으로 찾기 (예: 하나고, ㅎㄴㄱ)" />
                {q && <button type="button" aria-label="검색어 지우기" onClick={() => update('', region)}><X size={16} /></button>}
            </div>
            <div className="rd-cat-filters">
                <select aria-label="지역" value={region} onChange={e => update(q, e.target.value)}><option value="">전체 지역</option>{regions.map(r => <option key={r}>{r}</option>)}</select>
            </div>
        </div>
        <p className="rd-mk-count" role="status"><span>자료 보유 {rows.length}개 학교 중 {found.length}개</span></p>
        <div className="rd-x-rows rd-sd-rows">
            {found.map(s => <Link key={s.name} href={`/school/${encodeURIComponent(s.name)}`} className="rd-x-row">
                <span><b>{s.name}</b><small>{s.region || '지역 정보 확인 중'}, 기출 {s.count}회차</small></span>
                <ChevronRight size={22} aria-hidden="true" />
            </Link>)}
        </div>
        {!found.length && <p className="rd-cat-empty">일치하는 학교가 없습니다. 검색어나 지역을 바꿔 보세요. <button type="button" className="rd-cat-reset" onClick={() => update('', '')}>전체 학교 보기</button></p>}
    </section>;
}
