import SchoolDirectory from '@/components/SchoolDirectory';
import { NOT_A_SCHOOL } from '@/lib/stats';
import Link from 'next/link';
import { Metadata } from 'next';
import { createAdminClient } from '@/utils/supabase/server-admin';
import Header from '@/components/Header';
import { ChevronLeft } from 'lucide-react';
import { countExamGroupsBySchool, examGroupKey, examYearOf } from '@/lib/exam-groups';
import { getLongIndex } from '@/lib/exam-long';
import { HUB_SUBJECTS } from '@/lib/subject-hub';
import { buildRegionTree } from '@/lib/region-hub';

export const revalidate = 3600; // 1시간마다 갱신

// [10/23] '고등학교 시험 문제'·'기출 문제 사이트' 입구(대표: 홈은 강사용 그대로, 입구 페이지를 두껍게).
//   셈러시 추정으로 내신판 구글 유입의 91%가 이런 일반 검색어로 홈에 들어온다 — 우리 홈은 이름 검색만 잡힌다.
//   내신판 홈과 비교해 '목록'이 아니라 '검색 + 최근 등록 + 대비법' 순으로 짰다. 학교 목록은 시도별로 접는다.
export const metadata: Metadata = {
    title: '고등학교 수학 기출 문제 무료 · 전국 학교별 내신 기출 | 수학ETF',
    description: '전국 고등학교 수학 내신 기출 문제(중간고사·기말고사)를 학교별로 모았습니다. 문제 미리보기는 누구나, 해설 없는 전체 문제 PDF는 회원 무료입니다.',
    alternates: { canonical: '/schools' },
    openGraph: {
        title: '고등학교 수학 기출 문제 무료 · 전국 학교별 내신 기출 | 수학ETF',
        description: '전국 고등학교 수학 내신 기출 문제를 학교별로 모았습니다. 해설 없는 전체 문제 PDF는 회원 무료.',
        url: 'https://mathetf.com/schools',
        images: ['/og-image.png'],
    },
};

interface SchoolRow { name: string; region: string; count: number; }
interface ExamLink { id: string; school: string; label: string; ago?: string; }
interface HubLink { href: string; name: string; schools: number; exams: number; }

const SEM: Record<string, string> = { '1': '1학기', '2': '2학기' };
// 대비법 3단계의 '상위권 지역' — 학군지로 흔히 꼽는 곳 중 자체 지역 페이지가 있는 곳만 보인다.
const TOP_AREAS: [string, string][] = [['서울', '강남구'], ['서울', '서초구'], ['서울', '송파구'], ['서울', '양천구'], ['서울', '노원구'], ['경기', '성남시']];

const short = (school: string) => school.replace(/고등학교$/, '고');
const labelOf = (r: any) => `${examYearOf(r)} ${r.grade}학년 ${SEM[String(r.semester)] || ''} ${r.exam_type} ${r.subject || ''}`.replace(/\s+/g, ' ').trim();
const agoOf = (iso: string) => {
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return d <= 0 ? '오늘' : d === 1 ? '어제' : `${d}일 전`;
};

export default async function SchoolsIndexPage() {
    let rows: SchoolRow[] = [];
    let totalExams = 0, minYear = 0, maxYear = 0;
    let subjectCounts: [string, number][] = [];
    let analyzed: ExamLink[] = [];
    let latest: ExamLink[] = [];
    let areas: HubLink[] = [];
    try {
        const supabase = createAdminClient();
        // 1) 학교별 시험지 수 — 상세 페이지와 동일한 '시험(회차) 그룹' 기준으로 통일
        //    (기존: 해설 PDF 행수 기준 → 업로드 시차 등으로 상세 카운트와 어긋날 수 있었음)
        // ⚠ PostgREST 는 limit 을 안 줘도 1000행에서 잘린다. 페이지네이션이 없어 자료 1,378건 중
        //    1,000건만 집계돼 학교 10곳이 목록에서 통째로 빠져 있었다(8/18 GSC 미크롤 89개의 일부).
        const exams: any[] = [];
        let exFrom = 0;
        while (true) {
            const { data, error } = await supabase
                .from('exam_materials')
                .select('id, school, title, exam_year, grade, semester, exam_type, subject, file_type, content_type, created_at')
                .neq('school', 'DELETED')
                .order('id').range(exFrom, exFrom + 999);
            if (error || !data || data.length === 0) break;
            exams.push(...data);
            if (data.length < 1000) break;
            exFrom += 1000;
        }
        // 내신 학교 목록이므로 해설 PDF가 하나도 없는 유사 학교(전국연합·사관학교 등 DB 전용)는 기존처럼 제외
        const hasSolutionPdf = new Set(
            exams.filter((r: any) => !NOT_A_SCHOOL.has(r.school) && ['해설','개인DB'].includes(r.content_type)).map((r: any) => r.school)
        );
        const listed = exams.filter((r: any) => hasSolutionPdf.has(r.school));
        const counts = countExamGroupsBySchool(listed);

        // 입구 요약 — 회차 수·연도 범위·과목별 회차(학교 목록과 같은 '회차 묶음' 기준)
        const groups = new Map<string, any>();
        listed.forEach((r: any) => groups.set(`${r.school}|${examGroupKey(r)}`, r));
        totalExams = groups.size;
        const years = [...groups.values()].map(examYearOf).filter((y) => y >= 2000);
        if (years.length) { minYear = Math.min(...years); maxYear = Math.max(...years); }
        const bySubject: Record<string, number> = {};
        groups.forEach((r) => { if (r.subject) bySubject[r.subject] = (bySubject[r.subject] || 0) + 1; });
        subjectCounts = HUB_SUBJECTS.filter((x) => bySubject[x]).map((x) => [x, bySubject[x]] as [string, number]);

        // 시험지 페이지로 가는 링크는 회차마다 해설 PDF 행 하나(시험지 상세의 id)
        const pdfs = listed.filter((r: any) => r.content_type === '해설' && r.file_type === 'PDF');

        // 최근 올라온 기출 — 등록 시각 순 8회차
        const seen = new Set<string>();
        latest = [...pdfs].filter((r: any) => r.created_at)
            .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
            .filter((r: any) => { const k = `${r.school}|${examGroupKey(r)}`; if (seen.has(k)) return false; seen.add(k); return true; })
            .slice(0, 8)
            .map((r: any) => ({ id: r.id, school: r.school, label: labelOf(r), ago: agoOf(r.created_at) }));

        // 분석글이 붙은 시험지 — 최근 회차부터. 구글봇이 들어올 수 있는 시험지라 입구에서 바로 잇는다.
        try {
            const longIdx = await getLongIndex();
            analyzed = pdfs
                .filter((r: any) => longIdx[r.id])
                .sort((a: any, b: any) => examYearOf(b) - examYearOf(a) || Number(b.semester) - Number(a.semester)
                    || String(b.exam_type).localeCompare(String(a.exam_type), 'ko') || String(a.school).localeCompare(String(b.school), 'ko'))
                .slice(0, 24)
                .map((r: any) => ({ id: r.id, school: r.school, label: labelOf(r) }));
        } catch { analyzed = []; }

        // 2) 학교 → 지역(구/군) 매핑 (schools 테이블, 페이지네이션)
        const regionMap: Record<string, string> = {};
        let from = 0;
        while (true) {
            const { data, error } = await supabase.from('schools').select('name, region, district').order('id').range(from, from + 999);
            if (error || !data || data.length === 0) break;
            data.forEach((s: any) => { if (s.name && !regionMap[s.name]) regionMap[s.name] = [s.region, s.district].filter(Boolean).join(' '); });
            if (data.length < 1000) break;
            from += 1000;
        }

        rows = Object.keys(counts).map((name) => ({ name, region: regionMap[name] || '', count: counts[name] }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));

        // 3) 상위권 지역 허브(자체 페이지가 있는 곳만)
        try {
            const tree = await buildRegionTree();
            areas = TOP_AREAS.flatMap(([sido, gu]) => {
                const d = tree.find((s) => s.sido === sido)?.districts.find((x) => x.gu === gu);
                return d && d.hasPage ? [{ href: `/${encodeURIComponent('지역')}/${encodeURIComponent(sido)}/${encodeURIComponent(gu)}`, name: `${sido} ${gu}`, schools: d.schools.length, exams: d.examCount }] : [];
            });
        } catch { areas = []; }
    } catch {
        rows = [];
    }

    return (
        <div className="rd rd-x">
            <Header />
            <div>
                <section className="rd-wrap rd-x-top">
                    <Link href="/" className="rd-x-back"><ChevronLeft size={18} aria-hidden="true" />홈으로</Link>
                    <h1 className="rd-x-h1 rd-s-h1">전국 고등학교<br />수학 기출 문제</h1>
                    <p className="rd-lead">전국 고등학교의 수학 내신 기출(중간고사·기말고사)을 학교별로 모았습니다. 문제 미리보기는 누구나 볼 수 있고, 해설 없는 전체 문제 PDF는 회원에게 무료입니다.</p>
                    {rows.length > 0 && (
                        <div className="rd-x-links rd-si-pills">
                            <span className="rd-pill">학교 <strong>{rows.length}곳</strong></span>
                            <span className="rd-pill">시험지 <strong>{totalExams.toLocaleString()}회차</strong></span>
                            {minYear > 0 && <span className="rd-pill">{minYear}~{maxYear}년</span>}
                        </div>
                    )}
                </section>

                {/* 학교 찾기 — 검색창을 맨 위에. 검색 전에는 시도별로 접어 둔다(링크는 전부 HTML 에 있다). */}
                <section className="rd-wrap rd-s-list rd-si-find">
                    <SchoolDirectory rows={rows} grouped />
                    {/* 지역 허브로 가는 내부 링크 — 사이트맵에만 있고 사이트 안에서 도달할 수 없으면
                        색인이 잘 안 붙는다(8/18 학교 페이지에서 같은 문제를 겪었다). */}
                    <div className="rd-s-actions"><Link href="/지역" className="rd-btn rd-btn-gray">지역별로 찾기 (강남구·송파구 등)</Link></div>
                </section>

                {latest.length > 0 && (
                    <section className="rd-wrap rd-s-about">
                        <h2 className="rd-s-h2sm">최근 올라온 기출</h2>
                        <div className="rd-si-latest">
                            {latest.map((e) => (
                                <Link key={e.id} href={`/exam/${e.id}`}>
                                    <b>{short(e.school)}</b><span>{e.label}</span><small>{e.ago}</small>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                <section className="rd-s-zone">
                    <div className="rd-wrap">
                        <h2 className="rd-x-h2">기출은 세 곳을 봐야 합니다</h2>
                        <p className="rd-x-note">같은 학교 기출이 그대로 다시 나오지는 않습니다. 우리 학교 기출로 출제 방식을 읽고, 문제는 다른 학교 기출로 연습하세요.</p>
                        <ol className="rd-si-steps">
                            <li>
                                <b>1. 우리 학교 기출</b>
                                <p>어느 단원에서 몇 문제가 나오는지, 서술형을 어떻게 내는지 출제 경향을 읽습니다. 위에서 학교 이름으로 찾으세요.</p>
                            </li>
                            <li>
                                <b>2. 비슷하게 내는 학교의 기출</b>
                                <p>분석글이 있는 시험지 페이지에는 비슷한 문제가 나온 다른 학교 시험지가 붙어 있습니다. 고난도 문항과 닮은 문제가 나온 시험지, 같은 풀이법이 통하는 시험지를 각각 순위로 보여 드립니다. 실전 연습은 여기서 합니다.</p>
                            </li>
                            <li>
                                <b>3. 상위권 지역의 기출</b>
                                <p>어려운 문항이 많은 지역의 시험지로 고난도 문항을 미리 겪어 둡니다.</p>
                                {areas.length > 0 && (
                                    <div className="rd-rg-chips rd-si-chips">
                                        {areas.map((a) => <Link key={a.href} href={a.href} className="rd-rg-chip">{a.name} · {a.schools}개교</Link>)}
                                    </div>
                                )}
                            </li>
                        </ol>
                    </div>
                </section>

                {analyzed.length > 0 && (
                    <section className="rd-wrap rd-s-about">
                        <h2 className="rd-s-h2sm">분석글이 있는 기출 시험지</h2>
                        <p className="rd-x-note">출제 단원·난이도 분포·눈여겨볼 문항을 정리한 분석글이 함께 있는 시험지입니다.</p>
                        <div className="rd-rg-chips rd-si-chips">
                            {analyzed.map((e) => (
                                <Link key={e.id} href={`/exam/${e.id}`} className="rd-rg-chip">{short(e.school)} {e.label}</Link>
                            ))}
                        </div>
                    </section>
                )}

                {subjectCounts.length > 0 && (
                    <section className="rd-wrap rd-s-about">
                        <h2 className="rd-s-h2sm">과목별 고등학교 수학 기출</h2>
                        <p className="rd-x-note">보유한 시험지를 과목별로 세었습니다. 과목을 누르면 단원별 출제 분포와 학교 목록을 볼 수 있습니다.</p>
                        <div className="rd-rg-chips rd-si-chips">
                            {subjectCounts.map(([sub, n]) => (
                                <Link key={sub} href={`/subject/${encodeURIComponent(sub)}`} className="rd-rg-chip">{sub} · {n.toLocaleString()}회차</Link>
                            ))}
                        </div>
                    </section>
                )}

                <section className="rd-wrap rd-s-about">
                    <h2 className="rd-s-h2sm">기출 문제는 이렇게 받을 수 있어요</h2>
                    <div className="rd-s-prose">
                        <p><strong>미리보기</strong> — 시험지 페이지에서 문제 첫 쪽은 로그인 없이 볼 수 있고, 회원은 전체 쪽을 볼 수 있습니다.</p>
                        <p><strong>문제 PDF</strong> — 해설 없는 전체 문제 PDF는 로그인한 회원에게 무료입니다. 해설이 포함된 자료는 별도로 제공됩니다.</p>
                        <p><strong>우리 학교가 없다면</strong> — 시험지 사진이나 파일을 보내 주시면 한글 파일로 타이핑해 드리고, 자료가 올라오면 이 목록에도 추가됩니다.</p>
                    </div>
                </section>

                <div className="rd-x-more rd-s-more"><div className="rd-wrap rd-x-links">
                    <Link href="/지역" className="rd-link">지역별 기출 보기</Link>
                    <Link href="/question-bank" className="rd-link">기출로 시험지 만들기</Link>
                </div></div>
            </div>
        </div>
    );
}
