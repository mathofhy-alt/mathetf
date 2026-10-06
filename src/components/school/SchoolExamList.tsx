'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export type SchoolExamRow = { key: string; href: string; year: number; grade: number; title: string; subject: string; free: boolean };
export type SchoolExamLocation = { key: string; label: string; items: SchoolExamRow[] };

/**
 * 학교 페이지 시험지 목록(새 디자인): 연도별로 묶고 학년으로 거른다.
 * 모든 줄을 서버에서 그려 두고(검색엔진이 링크를 따라가게) 학년 거르기는 숨김으로만 한다.
 * 같은 이름의 학교가 두 지역에 있으면(경신고) 지역별로 나눈다.
 */
export default function SchoolExamList({ locations }: { locations: SchoolExamLocation[] }) {
    const [grade, setGrade] = useState<number | null>(null);
    const all = useMemo(() => locations.flatMap(l => l.items), [locations]);
    const grades = useMemo(() => Array.from(new Set(all.map(r => r.grade).filter(Boolean))).sort((a, b) => a - b), [all]);
    const count = grade === null ? all.length : all.filter(r => r.grade === grade).length;
    const multi = locations.length > 1;

    return <>
        <div className="rd-s-listhead">
            <h2 className="rd-x-h2">시험지 {count}개</h2>
            {grades.length > 1 && <div role="group" aria-label="학년으로 거르기" className="rd-seg">
                <button type="button" aria-pressed={grade === null} onClick={() => setGrade(null)}>전체</button>
                {grades.map(g => <button key={g} type="button" aria-pressed={grade === g} onClick={() => setGrade(g)}>{g}학년</button>)}
            </div>}
        </div>
        <p className="rd-x-note">회차를 누르면 시험지 미리보기와 받을 수 있는 파일이 나옵니다.</p>
        {multi && <p className="rd-s-warn">같은 이름의 학교가 {locations.length}곳입니다. 지역을 확인하고 받으세요.</p>}
        {locations.map(loc => {
            const years = Array.from(new Set(loc.items.map(r => r.year))).sort((a, b) => b - a);
            return <div key={loc.key}>
                {multi && <h3 className="rd-s-loc">{loc.label} <span>{loc.items.length}개</span></h3>}
                {years.map(year => {
                    const rows = loc.items.filter(r => r.year === year);
                    const visible = rows.some(r => grade === null || r.grade === grade);
                    return <div key={year} className="rd-s-year" hidden={!visible}>
                        <p className="rd-s-yearlabel">{year}년</p>
                        <div className="rd-x-rows">
                            {rows.map(r => <Link key={r.key} href={r.href} className="rd-x-row" hidden={grade !== null && r.grade !== grade}>
                                <span><b>{r.title}</b><small>{r.subject || '수학'}{r.free && <em className="rd-s-free">문제 무료</em>}</small></span>
                                <ChevronRight size={22} aria-hidden="true" />
                            </Link>)}
                        </div>
                    </div>;
                })}
            </div>;
        })}
    </>;
}
