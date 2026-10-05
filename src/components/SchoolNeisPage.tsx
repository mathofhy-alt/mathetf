import Link from 'next/link';
import Header from '@/components/Header';
import ReportSchoolButton from '@/components/ReportSchoolButton';
import { CalendarDays, BookOpen, School as SchoolIcon, PencilRuler, MapPin } from 'lucide-react';
import { NEIS_ACADEMIC_YEAR, NEIS_FETCHED_AT, type NeisSchoolPage, type NeisExam } from '@/lib/neis-school-pages';
import { REPORT_REWARD_LABEL } from '@/lib/report-reward';

/**
 * 기출이 아직 없는 학교 페이지 (2026-10 100곳 시험).
 * 원본 시험지 제보를 받으려고 연다. 얇은 페이지가 되지 않도록 NEIS 의 학교별 실제 정보(시험 일정·수학 과목·학급 수)와
 * 바로 쓸 수 있는 연결(같은 지역 기출·연습 시험지 만들기)을 중심에 둔다. '기출이 있는 척' 하지 않는다.
 */

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const fmt = (iso: string) => { const d = new Date(iso + 'T00:00:00+09:00'); return `${d.getMonth() + 1}월 ${d.getDate()}일(${DOW[d.getDay()]})`; };
const range = (e: NeisExam) => e.start === e.end ? fmt(e.start) : `${fmt(e.start)} ~ ${fmt(e.end)}`;
const gradeLabel = (g: number[]) => g.length && g.length < 3 ? ` (${g.join('·')}학년)` : '';
const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const dday = (iso: string) => Math.round((Date.parse(iso) - Date.parse(todayKst())) / 86400000);
const gradeText = (g: number[]) => g.length && g.length < 3 ? `${g.join('·')}학년` : '전 학년';

/** 같은 학기·같은 이름 시험을 한 칸으로 — 고3 은 수능 때문에 2학기 기말을 1·2학년과 따로 보는 학교가 많다 */
type ExamGroup = { sem: 1 | 2; name: string; parts: NeisExam[] };
function groupExams(exams: NeisExam[]): ExamGroup[] {
    const out: ExamGroup[] = [];
    for (const e of exams) {
        const g = out.find(x => x.sem === e.sem && x.name === e.name);
        if (g) g.parts.push(e); else out.push({ sem: e.sem, name: e.name, parts: [e] });
    }
    out.forEach(g => g.parts.sort((a, b) => a.start.localeCompare(b.start)));
    return out;
}
const groupEnd = (g: ExamGroup) => g.parts.reduce((m, p) => (p.end > m ? p.end : m), '');
const groupText = (g: ExamGroup) => g.parts.length === 1
    ? `${g.name}${gradeLabel(g.parts[0].grades)}로 ${range(g.parts[0])}`
    : `${g.name}로 ${g.parts.map(p => `${gradeText(p.grades)}은 ${range(p)}`).join(', ')}`;
/** NEIS 과목명 → 우리 DB 과목명 (로마 숫자 Ⅰ·Ⅱ 를 I·II 로) */
export const dbSubject = (s: string) => s.replace(/Ⅱ/g, 'II').replace(/Ⅰ/g, 'I').replace(/\s/g, '');

export function shortName(name: string) {
    if (name.endsWith('여자고등학교')) return name.slice(0, -6) + '여고';
    if (name.endsWith('고등학교')) return name.slice(0, -4) + '고';
    return null;
}

/** 학교마다 다른 사실만으로 쓰는 소개 문단 */
export function neisNarrative(s: NeisSchoolPage): string[] {
    const sn = shortName(s.name);
    const cls = Object.values(s.classes);
    const clsText = cls.length ? (new Set(cls).size === 1 ? `학년마다 ${cls[0]}학급` : Object.entries(s.classes).map(([g, n]) => `${g}학년 ${n}학급`).join(', ')) : '';
    const kind = [s.fond, s.kind, s.coedu && s.coedu !== '남여공학' ? `${s.coedu}학교` : s.coedu ? '남녀공학' : ''].filter(Boolean).join(' ');
    const paras = [`${s.name}${sn ? `(${sn})` : ''}는 ${s.region} ${s.district}에 있는 ${kind}입니다.${clsText ? ` ${NEIS_ACADEMIC_YEAR}학년도는 ${clsText}입니다.` : ''}`];
    const upcoming = groupExams(s.exams).filter(g => groupEnd(g) >= todayKst());
    if (upcoming[0]) paras.push(`다가오는 시험은 ${groupText(upcoming[0])}입니다.${upcoming[1] ? ` 이어서 ${groupText(upcoming[1]).replace(/로 /, '가 ')}에 있습니다.` : ''}`);
    const g = Object.entries(s.math).map(([grade, list]) => {
        const core = list.filter(x => !x.elective).map(x => x.subject), opt = list.filter(x => x.elective).map(x => x.subject);
        return `${grade}학년은 ${[...core, ...(opt.length ? [`${opt.join('·')}(선택)`] : [])].join(', ')}`;
    });
    if (g.length) paras.push(`이번 학기 수학 과목은 ${g.join(', ')}입니다.`);
    return paras;
}

export default function SchoolNeisPage({ s, nearby, toolLinks }: {
    s: NeisSchoolPage;
    nearby: { school: string; count: number }[];
    toolLinks: { subject: string; grade: string; href: string; scope: string; count: number; blueprint: string }[];
}) {
    const sn = shortName(s.name);
    const today = todayKst();
    const narrative = neisNarrative(s);
    const groups = groupExams(s.exams);
    const bySem = [1, 2].map(sem => ({ sem, list: groups.filter(g => g.sem === sem) })).filter(x => x.list.length);
    const nextGroup = groups.find(g => groupEnd(g) >= today);

    return (
        <div className="min-h-screen bg-[#F2F3F0] text-[#294437] font-sans">
            <Header />
            <main className="library-page max-w-3xl mx-auto px-4 py-8 sm:py-10">
                <Link href="/schools" className="text-sm text-[#426D36] hover:underline mb-4 inline-flex items-center gap-1">← 학교별 기출 목록</Link>

                <div className="mb-6">
                    <h1 className="text-2xl sm:text-3xl font-black break-keep">{s.name} 수학 내신</h1>
                    <p className="mt-2 text-sm text-slate-500 flex items-center gap-1.5"><MapPin size={14} /> {s.region} {s.district}{sn ? ` · ${sn}` : ''}</p>
                </div>

                {/* 학교 소개 — NEIS 사실 기반 */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
                    <h2 className="sr-only">{s.name} 학교 정보</h2>
                    <div className="space-y-2">{narrative.map((p, i) => <p key={i} className="text-sm leading-relaxed text-slate-600 break-keep">{p}</p>)}</div>
                </section>

                {/* 시험 일정 */}
                {bySem.length > 0 && (
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
                        <h2 className="text-base font-black flex items-center gap-2"><CalendarDays size={18} className="text-[#638747]" /> {NEIS_ACADEMIC_YEAR}학년도 시험 일정</h2>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            {bySem.map(({ sem, list }) => (
                                <div key={sem}>
                                    <p className="text-xs font-bold text-[#426D36] mb-1.5">{sem}학기</p>
                                    <ul className="space-y-1.5">
                                        {list.map(g => {
                                            const isNext = g === nextGroup, past = groupEnd(g) < today;
                                            const badge = (e: NeisExam) => { const d = dday(e.start); return isNext && e.end >= today ? <span className="shrink-0 rounded-full bg-[#638747] px-2 py-0.5 text-[11px] font-black text-white tabular-nums">{d > 0 ? `D-${d}` : '시험 중'}</span> : null; };
                                            return (
                                                <li key={g.name + g.parts[0].start} className={`rounded-lg px-3 py-2 text-sm ${isNext ? 'bg-[#EAF1E1] border border-[#C5D8B5]' : 'bg-[#F7F8F5]'} ${past ? 'text-slate-400' : ''}`}>
                                                    {g.parts.length === 1 ? (
                                                        <div className="flex items-start justify-between gap-2">
                                                            <span className="break-keep"><b className={past ? 'font-semibold' : 'text-[#294437]'}>{g.name}{gradeLabel(g.parts[0].grades)}</b><br /><span className="text-xs tabular-nums">{range(g.parts[0])}</span></span>
                                                            {badge(g.parts[0])}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <b className={past ? 'font-semibold' : 'text-[#294437]'}>{g.name}</b>
                                                            <ul className="mt-1 space-y-1">
                                                                {g.parts.map(e => (
                                                                    <li key={e.start} className={`flex items-center justify-between gap-2 ${e.end < today ? 'text-slate-400' : ''}`}>
                                                                        <span className="text-xs tabular-nums break-keep"><span className="inline-block min-w-[4.2rem] font-bold">{gradeText(e.grades)}</span>{range(e)}</span>
                                                                        {badge(e)}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ))}
                        </div>
                        <p className="mt-3 text-[11px] text-slate-400">출처: 나이스 교육정보 개방 포털 학사일정 · {NEIS_FETCHED_AT} 기준. 학교 사정으로 바뀔 수 있으니 학교 공지를 함께 확인하세요.</p>
                    </section>
                )}

                {/* 학년별 수학 과목 */}
                {Object.keys(s.math).length > 0 && (
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
                        <h2 className="text-base font-black flex items-center gap-2"><BookOpen size={18} className="text-[#638747]" /> 이번 학기 학년별 수학 과목</h2>
                        <dl className="mt-3 space-y-2">
                            {Object.entries(s.math).map(([g, list]) => (
                                <div key={g} className="flex gap-3 items-baseline">
                                    <dt className="w-12 shrink-0 text-xs font-bold text-slate-500">{g}학년</dt>
                                    <dd className="flex flex-wrap gap-1.5">
                                        {list.map(m => <span key={m.subject} className={`text-xs px-2 py-1 rounded-full border ${m.elective ? 'bg-white border-slate-200 text-slate-600' : 'bg-[#EAF1E1] border-[#C5D8B5] text-[#294437] font-bold'}`}>{m.subject}{m.elective ? ' · 선택' : ''}</span>)}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                        <p className="mt-3 text-[11px] text-slate-400">출처: 나이스 고등학교 시간표 ({NEIS_ACADEMIC_YEAR}학년도 2학기). 선택은 일부 반만 듣는 과목입니다.</p>
                    </section>
                )}

                {/* 연습 시험지 — 같은 지역 기출로 */}
                {toolLinks.length > 0 && (
                    <section className="bg-white rounded-2xl border-2 border-[#9BD4D2] shadow-sm p-5 mb-4">
                        <h2 className="text-base font-black flex items-center gap-2"><PencilRuler size={18} className="text-[#638747]" /> 실제 시험 구성 그대로 연습 시험지 만들기</h2>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600 break-keep">{s.name} 기출은 아직 없어서, 가까운 학교의 실제 시험 한 회차를 기준으로 삼아요. 그 시험과 <b>문항 수·단원·난이도가 같게</b> 다른 학교 기출 문항으로 채워 드립니다. 한글(HML)로 받아 풀거나 수업에 쓸 수 있고, 다른 문항으로 다시 만들려면 시험지 화면에서 ‘비우기’ 후 버튼을 다시 누르세요.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {toolLinks.map(t => (
                                <Link key={t.subject} href={t.href} className="rounded-xl border border-[#638747] px-3 py-2 text-sm font-bold text-[#426D36] hover:bg-[#EAF1E1]">
                                    {t.grade}학년 {t.subject} →
                                    <span className="block text-xs font-normal text-slate-500">{t.blueprint ? `${t.blueprint} 구성 · ${t.scope} 기출 ${t.count}회차에서` : `내신 기출이 아직 없어 모의고사 ${t.count}회차 문항에서 직접 고르기`}</span>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                {/* 원본 제보 */}
                <section className="rounded-2xl bg-[#20354F] text-white p-5 sm:p-6 mb-4">
                    <h2 className="text-lg font-black break-keep">{s.name} 시험지가 아직 없어요</h2>
                    <p className="mt-2 text-sm text-white/85 leading-relaxed break-keep">학교에서 받은 수학 시험지를 스캔 PDF나 사진으로 올려 주세요. 채택되면 <b className="text-white">{REPORT_REWARD_LABEL}</b>를 드리고, 정리한 시험지를 이 페이지에 올립니다.</p>
                    <div className="mt-4"><ReportSchoolButton code={s.code} label="이 학교 시험지 제보하기" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-extrabold text-[#20354F] hover:bg-slate-100" /></div>
                </section>

                {/* 같은 지역 기출 */}
                {nearby.length > 0 && (
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <h2 className="text-base font-black flex items-center gap-2"><SchoolIcon size={18} className="text-[#638747]" /> {s.district} 다른 학교 기출</h2>
                        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                            {nearby.map(n => (
                                <li key={n.school}><Link href={`/school/${encodeURIComponent(n.school)}`} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 hover:shadow-sm hover:border-[#C5D8B5]">
                                    <span className="font-bold text-sm">{n.school}</span><span className="text-xs text-slate-500">{n.count}회차</span>
                                </Link></li>
                            ))}
                        </ul>
                    </section>
                )}
            </main>
        </div>
    );
}
