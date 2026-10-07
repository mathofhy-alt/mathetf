'use client';
import { useState } from 'react';
import { CURRICULA } from '@/lib/curriculum';

type SubjUnits = { subject: string; total: number; units: { unit: string; count: number }[] }[];

/**
 * 학교 페이지 '자주 나온 단원'(새 디자인). 과목을 교육과정별(2022/2015)로 묶어 고르고, 오른쪽에 단원 막대.
 * 모든 과목 패널을 DOM 에 두고 고른 것만 보인다 — 단원 이름이 검색엔진에도 보이게(옛 화면과 같음).
 */
export default function SchoolUnits({ title, subjUnits }: { title: string; subjUnits: SubjUnits }) {
    const [current, setCurrent] = useState(subjUnits[0]?.subject || '');
    const known = new Set(CURRICULA.flatMap(c => [...c.subjects]));
    const groups = [
        ...CURRICULA.map(c => ({ label: c.label, list: subjUnits.filter(s => c.subjects.includes(s.subject)) })),
        { label: '그 밖의 과목', list: subjUnits.filter(s => !known.has(s.subject)) },
    ].filter(g => g.list.length);

    return <div className="rd-wrap rd-s-units">
        <div>
            <h2 className="rd-x-h2">{title}</h2>
            <p className="rd-lead">보유 기출을 단원별로 센 결과입니다. 과목을 눌러 보세요.</p>
            {groups.map(g => <div key={g.label} className="rd-s-cur">
                <p className="rd-s-curlabel">{g.label}</p>
                <div className="rd-s-chips">
                    {g.list.map(s => <button key={s.subject} type="button" className="rd-op-fbtn is-white" aria-pressed={current === s.subject} onClick={() => setCurrent(s.subject)}>{s.subject}</button>)}
                </div>
            </div>)}
        </div>
        <div>
            {subjUnits.map(s => {
                const max = Math.max(1, ...s.units.map(u => u.count));
                return <div key={s.subject} className="rd-s-unitcard" hidden={s.subject !== current}>
                    <div className="rd-s-unithead"><h3>{s.subject}</h3><span>{s.total}문항</span></div>
                    <div className="rd-x-bars is-tight">
                        {s.units.map(u => <div key={u.unit} className="rd-x-bar is-small">
                            <span title={u.unit}>{u.unit}</span>
                            <div className="rd-x-track"><span style={{ width: `${Math.round(u.count / max * 100)}%` }} /></div>
                            <span>{u.count}</span>
                        </div>)}
                    </div>
                </div>;
            })}
        </div>
    </div>;
}
