import {readAllPages} from '@/lib/questions/catalog';
import { createAdminClient } from '@/utils/supabase/server-admin';
import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SchoolExamList, { type SchoolExamLocation } from '@/components/school/SchoolExamList';
import SchoolUnits from '@/components/school/SchoolUnits';
import { examYearOf, examGroupKey } from '@/lib/exam-groups';
import { proxiedOgImage } from '@/lib/og-image';
import { NOT_A_SCHOOL } from '@/lib/stats';
import SchoolNeisPage, { dbSubject, neisNarrative } from '@/components/SchoolNeisPage';
import { neisSchoolPage, NEIS_ACADEMIC_YEAR, type NeisSchoolPage } from '@/lib/neis-school-pages';

/** 기출 없는 학교(NEIS 시험 100곳) — 같은 구 기출 학교와 연습 시험지 링크를 채운다 */
const QB_SUBJECTS = new Set(['공통수학1', '공통수학2', '대수', '미적분I', '미적분II', '확률과통계', '기하']);
async function renderNeisSchool(s: NeisSchoolPage) {
    const { data } = await createAdminClient().from('exam_materials')
        .select('school, title, exam_year, grade, semester, exam_type, subject')
        .eq('region', s.region).eq('district', s.district).in('content_type', ['해설', '개인DB']);
    const per: Record<string, Set<string>> = {};
    for (const r of data || []) (per[r.school] ||= new Set()).add(examGroupKey(r as any));
    const nearby = Object.entries(per).map(([school, k]) => ({ school, count: k.size }))
        .filter(n => !NOT_A_SCHOOL.has(n.school)).sort((a, b) => b.count - a.count).slice(0, 8);
    const seen = new Set<string>();
    const wanted = Object.entries(s.math).flatMap(([grade, list]) => list.map(m => ({ grade, subject: dbSubject(m.subject) })))
        .filter(t => QB_SUBJECTS.has(t.subject) && !seen.has(t.subject) && (seen.add(t.subject), true));
    // [10/5] 과목마다 자료가 있는 범위로 넓힌다: 같은 구 → 같은 시·도 → 전국. 구 기준으로만 걸면
    //   경성고(마포구) 미적분I 처럼 '조건에 맞는 문제 없음' 이 뜬다 (2022 과목은 아직 회차가 적다).
    const { data: dbs } = wanted.length ? await createAdminClient().from('exam_materials')
        .select('id, school, region, district, title, exam_year, grade, semester, exam_type, subject')
        .eq('content_type', '개인DB').eq('file_type', 'DB').in('subject', wanted.map(t => t.subject)) : { data: [] as any[] };
    const enc = encodeURIComponent;
    // 이 학교의 다음 시험(학년별) — 그 시험과 같은 학기·같은 시험(중간/기말) 회차를 구성 기준으로 삼는다
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    // 학교마다 이름이 다르다: 중간고사 / 1차 정기시험 / 1회고사 / 2-1회고사 … — 못 읽으면 학기만 맞춘다
    const kindOf = (name: string) => /중간|1차|1회/.test(name) ? '중간고사' : /기말|2차|2회/.test(name) ? '기말고사' : '';
    const targetOf = (grade: string) => {
        const e = s.exams.find(x => x.end >= today && !/졸업/.test(x.name) && (!x.grades.length || x.grades.includes(Number(grade))));
        return e ? { semester: e.sem, examType: kindOf(e.name) } : null;
    };
    const toolLinks = wanted.flatMap(t => {
        const all = (dbs || []).filter((r: any) => r.subject === t.subject);
        const naesin = all.filter((r: any) => ['중간고사', '기말고사'].includes(r.exam_type) && !NOT_A_SCHOOL.has(r.school));
        // 내신 기출이 아예 없는 과목(10/5 기준 확률과통계)은 모의고사 문항 목록으로만 연결 — 구성 맞추기는 하지 않는다
        if (!naesin.length) return all.length ? [{ ...t, scope: '모의고사', count: new Set(all.map((r: any) => `${r.school}|${examGroupKey(r)}`)).size, blueprint: '',
            href: `/question-bank?exam=${enc('모의고사')}&subject=${enc(t.subject)}&origin=school-neis` }] : [];   // 전체 DB(2,600여 개) 대신 모의고사(400여 개)만 — 같은 문항, 부하 1/6
        const rows = naesin;
        const scopes = [
            { label: s.district, q: `region=${enc(s.region)}&district=${enc(s.district)}`, rows: rows.filter((r: any) => r.region === s.region && r.district === s.district) },
            { label: s.region, q: `region=${enc(s.region)}`, rows: rows.filter((r: any) => r.region === s.region) },
            { label: '전국', q: '', rows },
        ];
        // 1회차(20여 문항)뿐이면 연습이 안 된다 — 3회차 이상인 가장 가까운 범위, 전국은 있기만 하면
        const n = (x: { rows: any[] }) => new Set(x.rows.map((r: any) => `${r.school}|${examGroupKey(r)}`)).size;
        const hit = scopes.find((x, i) => n(x) >= (i < 2 ? 3 : 1));
        if (!hit) return [];
        const count = n(hit);
        // 구성 기준 회차: 다음 시험과 같은 학기·시험 > 가까운 곳(같은 구 > 시·도 > 전국) > 최근 연도
        const target = targetOf(t.grade);
        const tier = (r: any) => r.region === s.region ? (r.district === s.district ? 0 : 1) : 2;
        const bp = [...rows].sort((a: any, b: any) => {
            const m = (r: any) => !target || Number(r.semester) !== target.semester ? 2 : r.exam_type === target.examType ? 0 : 1;   // 같은 시험 > 같은 학기
            return m(a) - m(b) || tier(a) - tier(b) || examYearOf(b) - examYearOf(a);
        })[0] as any;
        const bpLabel = bp ? `${bp.school.replace(/고등학교$/, '고')} ${examYearOf(bp)} ${bp.semester}학기 ${bp.exam_type}` : '';
        return [{ ...t, scope: hit.label, count, blueprint: bpLabel,
            href: `/question-bank?${hit.q ? hit.q + '&' : ''}subject=${enc(t.subject)}${bp ? `&blueprint=${bp.id}` : ''}&origin=school-neis` }];
    });
    return <SchoolNeisPage s={s} nearby={nearby} toolLinks={toolLinks} />;
}

/**
 * [SEO] 학교 축약명. 사람들은 '창덕여자고등학교'가 아니라 '창덕여고'로 검색하는데
 * 페이지에 축약형이 한 번도 없어 그 검색어로는 잡히지 않았다(8/18 확인).
 * 121개교 전수 검사 결과 축약형 충돌은 0건. 특수 페이지(사관학교·경찰대·전국연합)는 대상 아님.
 */
function shortSchoolName(name: string): string | null {
    let s: string | null = null;
    if (name.endsWith('여자고등학교')) s = name.slice(0, -6) + '여고';
    else if (name.endsWith('여자중학교')) s = name.slice(0, -5) + '여중';
    else if (name.endsWith('고등학교')) s = name.slice(0, -4) + '고';
    else if (name.endsWith('중학교')) s = name.slice(0, -3) + '중';
    return s && s !== name ? s : null;
}


// 1시간마다 자동 재검증 (새 시험지 추가 반영)
export const revalidate = 3600;

interface Props {
    params: { schoolName: string };
}

// 빌드 시 실제 데이터 있는 학교만 미리 생성
export async function generateStaticParams() {
    const supabase = createAdminClient();
    const data: { school: string }[] = [];
    for (let offset = 0; ; offset += 1000) {
        const { data: page, error } = await supabase
            .from('exam_materials')
            .select('school')
            .neq('school', 'DELETED')
            .order('id')
            .range(offset, offset + 999);
        if (error) throw error;
        data.push(...(page || []));
        if (!page || page.length < 1000) break;
    }

    // [2026-09-14] '전국연합·경찰대학교·사관학교·평가원' 은 학교가 아니다 — 페이지를 만들지 않는다.
    const schools = Array.from(new Set(data.map((item: any) => item.school))).filter((s: any) => s && !NOT_A_SCHOOL.has(s));
    return schools.map((school: string) => ({
        schoolName: school,  // Next.js가 URL 디코딩을 자동으로 처리하므로 인코딩 불필요
    }));
}

// 학교 대표 og:image — 그 학교 시험지 미리보기 첫 장 (없으면 공통 로고)
async function schoolOgImage(schoolName: string): Promise<string> {
    try {
        const supabase = createAdminClient();
        const { data } = await supabase
            .from('exam_materials')
            .select('preview_urls')
            .eq('school', schoolName)
            .not('preview_urls', 'is', null)
            .order('created_at', { ascending: false })
            .limit(5);
        const first = (data || [])
            .flatMap((r: any) => (Array.isArray(r.preview_urls) ? r.preview_urls : []))
            .find(Boolean);
        if (first) return proxiedOgImage(first);
    } catch { }
    return '/og-image.png';
}

// 공개 카드로 나가는 회차(해설·개인DB)가 하나라도 있는지 — 없으면 NEIS 페이지로
async function hasPublicExams(schoolName: string) {
    const { count } = await createAdminClient().from('exam_materials').select('id', { count: 'exact', head: true })
        .eq('school', schoolName).in('content_type', ['해설', '개인DB']);
    return (count || 0) > 0;
}

// 동적 메타 태그 - 학교명 포함
export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const schoolName = decodeURIComponent(params.schoolName);
    const ogImage = await schoolOgImage(schoolName);

    // 경찰대·사관학교·전국연합 특화 키워드
    const SPECIAL_SCHOOLS: Record<string, { title: string; description: string; keywords: string[] }> = {
        '경찰대학교': {
            title: '경찰대학교 수학 기출문제·변형문제 - 수학ETF',
            description: '경찰대학교 1차 수학 기출문제와 변형문제 다운로드. 원본 기출은 물론 같은 유형의 변형문제까지 HWP·PDF로 무료 제공.',
            keywords: ['경찰대 수학', '경찰대 기출문제', '경찰대 변형문제', '경찰대 수학 문제', '경찰대학교 입학시험', '경찰대 수학 기출'],
        },
        '육군사관학교': {
            title: '육군사관학교 수학 기출문제·변형문제 - 수학ETF',
            description: '육군사관학교 수학 기출문제와 변형문제 다운로드. 원본 기출과 같은 유형의 변형문제를 HWP·PDF로 무료 제공.',
            keywords: ['육군사관학교 수학', '사관학교 수학', '사관학교 기출문제', '사관학교 변형문제', '육사 수학 기출'],
        },
        '해군사관학교': {
            title: '해군사관학교 수학 기출문제·변형문제 - 수학ETF',
            description: '해군사관학교 수학 기출문제와 변형문제 다운로드. 원본 기출과 같은 유형의 변형문제를 HWP·PDF로 무료 제공.',
            keywords: ['해군사관학교 수학', '사관학교 수학', '사관학교 기출문제', '사관학교 변형문제', '해사 수학 기출'],
        },
        '공군사관학교': {
            title: '공군사관학교 수학 기출문제·변형문제 - 수학ETF',
            description: '공군사관학교 수학 기출문제와 변형문제 다운로드. 원본 기출과 같은 유형의 변형문제를 HWP·PDF로 무료 제공.',
            keywords: ['공군사관학교 수학', '사관학교 수학', '사관학교 기출문제', '사관학교 변형문제', '공사 수학 기출'],
        },
        '국군간호사관학교': {
            title: '국군간호사관학교 수학 기출문제·변형문제 - 수학ETF',
            description: '국군간호사관학교 수학 기출문제와 변형문제 다운로드. 원본 기출과 같은 유형의 변형문제를 HWP·PDF로 무료 제공.',
            keywords: ['국군간호사관학교 수학', '사관학교 수학', '사관학교 변형문제', '간호사관학교 수학 기출'],
        },
        '사관학교': {
            title: '사관학교 수학 기출문제·변형문제 (육·해·공·간호 1차) - 수학ETF',
            description: '사관학교 1차 필기 수학 기출문제와 변형문제 다운로드. 원본 기출은 물론 같은 유형의 변형문제까지 HWP·PDF로 무료 제공.',
            keywords: ['사관학교 수학', '사관학교 기출', '사관학교 변형문제', '사관학교 1차 수학', '육군사관학교 수학', '해군사관학교 수학', '공군사관학교 수학', '국군간호사관학교 수학', '사관학교 수학 기출'],
        },
        '전국연합': {
            title: '전국연합학력평가 수학 기출문제·변형문제 - 수학ETF',
            description: '전국연합학력평가 수학 기출문제와 변형문제 다운로드. 3월·6월·9월·11월 학력평가 원본과 변형문제를 HWP·PDF로 무료 제공.',
            keywords: ['전국연합학력평가 수학', '전국연합 변형문제', '수학 모의고사', '3월 모의고사 수학', '6월 모의고사 수학', '9월 모의고사 수학', '11월 모의고사 수학', '고1 모의고사 수학', '고2 모의고사 수학', '고3 모의고사 수학'],
        },
        // 평가원(한국교육과정평가원) 주관 6·9월 모의평가. 교육청 주관 전국연합과 다른 시험이다.
        '평가원': {
            title: '평가원 6·9월 모의평가 수학 기출문제·변형문제 - 수학ETF',
            description: '한국교육과정평가원 6월·9월 모의평가 수학 기출문제와 변형문제 다운로드. 그해 수능 출제 경향을 보여주는 시험으로, 원본과 변형문제를 HWP·PDF로 무료 제공.',
            keywords: ['평가원 모의고사 수학', '6월 모의평가 수학', '9월 모의평가 수학', '평가원 기출', '모평 수학', '6모 수학', '9모 수학', '수능 대비 모의평가', '고3 평가원'],
        },
    };

    const special = SPECIAL_SCHOOLS[schoolName];
    if (special) {
        return {
            title: special.title,
            description: special.description,
            keywords: special.keywords,
            openGraph: {
                title: special.title,
                description: special.description,
                url: `https://mathetf.com/school/${encodeURIComponent(schoolName)}`,
                images: [ogImage],
            },
            alternates: { canonical: `/school/${encodeURIComponent(schoolName)}` },
        };
    }

    // 기출 없는 학교(NEIS 시험 페이지) — 있지도 않은 '기출문제'를 제목에 걸지 않는다
    const neisPage = neisSchoolPage(schoolName);
    if (neisPage && !(await hasPublicExams(schoolName))) {
        const sn = shortSchoolName(schoolName);
        const t = `${schoolName}${sn ? `(${sn})` : ''} 수학 내신 — ${NEIS_ACADEMIC_YEAR} 시험 일정·수학 과목 | 수학ETF`;
        const d = neisNarrative(neisPage).join(' ').slice(0, 155);
        return {
            title: t, description: d,
            openGraph: { title: t, description: d, url: `https://mathetf.com/school/${encodeURIComponent(schoolName)}`, images: ['/og-image.png'] },
            alternates: { canonical: `/school/${encodeURIComponent(schoolName)}` },
            ...(neisPage.unique ? {} : { robots: { index: false, follow: true } }),
        };
    }

    const shortName = shortSchoolName(schoolName);
    const titleName = shortName ? `${schoolName}(${shortName})` : schoolName;
    return {
        title: `${titleName} 수학 기출문제 - 수학ETF`,
        description: `${titleName} 수학 내신 기출문제 다운로드. 중간고사, 기말고사 HWP, PDF 형식 제공. 수학ETF에서 즉시 확인하세요.`,
        keywords: [
            `${schoolName} 수학 기출문제`, `${schoolName} 내신`, `${schoolName} 중간고사`, `${schoolName} 기말고사`,
            ...(shortName ? [`${shortName} 수학 기출`, `${shortName} 기출문제`, `${shortName} 내신`, `${shortName} 중간고사`, `${shortName} 기말고사`] : []),
            '수학 내신 기출문제', '수학 문제은행',
        ],
        openGraph: {
            title: `${titleName} 수학 기출문제 - 수학ETF`,
            description: `${titleName} 수학 내신 기출문제를 즉시 다운로드하세요.`,
            url: `https://mathetf.com/school/${encodeURIComponent(schoolName)}`,
            images: [ogImage],
        },
        alternates: { canonical: `/school/${encodeURIComponent(schoolName)}` },
    };
}

// 특수 페이지(사관학교·경찰대·전국연합 등)는 '내신'이 아니므로 전용 소개문 사용 (검색의도 일치 + CTR)
const SPECIAL_INTRO: Record<string, string> = {
    '사관학교': '사관학교(육군·해군·공군·국군간호) 1차 필기시험 수학 영역 기출문제 모음입니다. 원본 기출은 물론 같은 유형의 변형문제까지 제공해, 한 번 더 실전 연습할 수 있어요. 문제와 해설을 PDF·한글(HWP)로 무료로 받을 수 있습니다.',
    '육군사관학교': '육군사관학교 1차시험 수학 기출문제 모음입니다. 원본 기출과 같은 유형의 변형문제를 함께 제공해 상위권 실전 대비에 좋습니다. 문제와 해설을 PDF·한글(HWP)로 무료 제공합니다.',
    '해군사관학교': '해군사관학교 1차시험 수학 기출문제 모음입니다. 원본 기출과 같은 유형의 변형문제를 함께 제공해 상위권 실전 대비에 좋습니다. 문제와 해설을 PDF·한글(HWP)로 무료 제공합니다.',
    '공군사관학교': '공군사관학교 1차시험 수학 기출문제 모음입니다. 원본 기출과 같은 유형의 변형문제를 함께 제공해 상위권 실전 대비에 좋습니다. 문제와 해설을 PDF·한글(HWP)로 무료 제공합니다.',
    '국군간호사관학교': '국군간호사관학교 1차시험 수학 기출문제 모음입니다. 원본 기출과 같은 유형의 변형문제를 함께 제공합니다. 문제와 해설을 PDF·한글(HWP)로 무료 제공합니다.',
    '경찰대학교': '경찰대학교 1차시험 수학 기출문제 모음입니다. 원본 기출은 물론 같은 유형의 변형문제까지 제공해 상위권 실전 감각 훈련에 좋습니다. 문제와 해설을 PDF·한글(HWP)로 무료 제공합니다.',
    '전국연합': '전국연합학력평가(시·도 교육청 주관) 수학 기출문제 모음입니다. 3월·6월·9월·11월 학력평가 원본 문제와 같은 유형의 변형문제를 학년·연도별로 정리했어요. 문제와 해설을 PDF·한글(HWP)로 무료로 받을 수 있습니다.',
};

type SubjUnits = { subject: string; total: number; units: { unit: string; count: number }[] }[];

// [SEO] 학교 페이지 고유 서술 문단 (지역·연도·과목·단원 데이터 기반)
function buildSchoolNarrative(
    schoolName: string, region: string, examCount: number,
    years: number[], subjects: string[], subjUnits: SubjUnits, specialIntro?: string
): string[] {
    const paras: string[] = [];
    if (specialIntro) {
        paras.push(`${specialIntro} 현재 ${examCount}개 회차의 문제와 해설을 제공하며, 제공되는 문제 PDF는 회원 무료로 하루 10회까지 받을 수 있으며, 해설·원본 파일 가격은 자료마다 다릅니다.`);
    } else {
        const yearStr = years.length === 1 ? `${years[0]}년 ` : years.length > 0 ? `${years[years.length - 1]}년부터 ${years[0]}년까지 ` : '';
        const subjStr = subjects.length > 0 ? `${subjects.join('·')} 등 ` : '';
        // 축약명을 첫 문장에 한 번 병기 — 실제 검색어('창덕여고 수학기출')와 페이지를 잇는다
        const sn = shortSchoolName(schoolName);
        paras.push(
            `${schoolName}${sn ? `(${sn})` : ''}${region ? ` (${region})` : ''}의 수학 내신 기출문제 모음입니다. ` +
            `${yearStr}${subjStr}총 ${examCount}개 시험지의 문제와 해설을 제공하며, ` +
            `미리보기와 무료 문제 PDF는 준비된 회차에서 제공됩니다. 무료 PDF는 회원당 하루 10회까지이며, 해설 PDF·HWP 가격은 자료별로 확인하세요.`
        );
    }
    if (subjUnits.length > 0) {
        const topSubj = subjUnits[0];
        const topUnits = topSubj.units.slice(0, 3).map((u) => `${u.unit}(${u.count}문항)`).join(', ');
        paras.push(
            `가장 많은 문항이 축적된 과목은 ${topSubj.subject}(${topSubj.total}문항)이며, ` +
            `${topUnits} 단원에서 특히 출제가 많았습니다. ` +
            `학교별 출제 경향을 파악하면 시험 범위 안에서 우선순위를 정해 대비할 수 있습니다.`
        );
    }
    const sn2 = specialIntro ? null : shortSchoolName(schoolName);
    paras.push(
        `기출의 단원과 난이도를 살펴보고, 배운 범위에 맞는 문항을 골라 반복 연습할 수 있습니다. ` +
        (sn2 ? `${sn2} 중간고사·기말고사 대비 자료를 찾는다면 ` : '') +
        `필요한 회차를 골라 나만의 시험지로 구성해 한글에서 여는 HML 파일로 저장해보세요.`
    );
    return paras;
}

export default async function SchoolPage({ params }: Props) {
    const schoolName = decodeURIComponent(params.schoolName);
    // [2026-09-14] 가짜 학교(모의고사 분류명)는 404. /subject 허브가 링크하던 것도 같이 끊었다.
    if (NOT_A_SCHOOL.has(schoolName)) notFound();
    const specialIntro = SPECIAL_INTRO[schoolName];
    const supabase = createAdminClient();

    const { data: exams } = await supabase
        .from('exam_materials')
        .select('*')
        .eq('school', schoolName)
        .neq('school', 'DELETED')
        .order('created_at', { ascending: false });

    const neisPage = specialIntro ? null : neisSchoolPage(schoolName);
    if (!exams || exams.length === 0) {
        if (neisPage) return renderNeisSchool(neisPage);
        notFound();
    }

    // 시험 단위로 그룹핑 (/schools 목록 카운트와 동일 기준 — lib/exam-groups)
    const groups: Record<string, any> = {};
    exams.forEach((item: any) => {
        const year = examYearOf(item);
        // [2026-09-08] 키 앞에 지역을 붙인다. 이 페이지는 학교 '이름' 으로만 조회하는데
        //   같은 이름이 두 지역에 있으면(경신고 = 대구 수성구 / 서울 종로구) 두 학교 자료가
        //   한 목록에 섞이고, 회차 메타까지 같으면 한 줄로 합쳐져 하나가 사라진다.
        const locKey = `${item.region || ''}|${item.district || ''}`;
        const key = `${locKey}-${examGroupKey(item)}`;
        if (!groups[key]) {
            groups[key] = {
                year,
                grade: item.grade,
                semester: item.semester,
                examType: item.exam_type,
                subject: item.subject || '',
                region: item.region || '',
                district: item.district || '',
                locKey,
                files: [],
            };
        }
        groups[key].files.push(item);
    });

    // [2026-09-14] 해설이 없는 회차(원본제보만 있는 것)는 카드로 내지 않는다.
    //   그 카드가 /exam/{id} 로 이어지면 "문제·해설 PDF" 제목에 "미리보기 준비 중" 만 있는 빈 페이지가 된다.
    //   전수조사에서 4개 회차(포천·백마·영동·가재울)가 그 상태로 링크돼 있었다.
    const examList = Object.values(groups)
        .filter((g: any) => g.files.some((f: any) => f.content_type === '해설' || f.content_type === '개인DB'))
        .sort((a: any, b: any) => b.year - a.year);
    if (examList.length === 0 && neisPage) return renderNeisSchool(neisPage);   // 원본제보만 들어온 학교

    // 이 이름으로 실제 자료가 있는 지역들. 2곳 이상이면 목록을 지역별로 나눠 보여준다.
    const locations: { key: string; label: string; items: any[] }[] = [];
    for (const g of examList as any[]) {
        let loc = locations.find(l => l.key === g.locKey);
        if (!loc) {
            loc = { key: g.locKey, label: [g.region, g.district].filter(Boolean).join(' ') || '지역 미상', items: [] };
            locations.push(loc);
        }
        loc.items.push(g);
    }

    // [SEO] 학교 지역 + 단원 분포 (얇은 콘텐츠 방지용 고유 텍스트)
    // [2026-09-08] 자료에 있는 지역을 먼저 쓴다. schools 테이블 첫 행을 쓰면 동명이교일 때
    //   한쪽을 임의로 골라 "(서울 종로구)의 기출" 이라고 단정한다(경신고는 대구 자료가 4개로 더 많다).
    //   두 지역이면 둘 다 적는다 — 소개 문단이 한쪽만 주장하지 않게.
    let region = locations.map(l => l.label).filter(l => l && l !== '지역 미상').join('·');
    if (!region) {
        try {
            const { data: sc } = await supabase.from('schools').select('region, district').eq('name', schoolName).limit(1);
            if (sc && sc[0]) region = [sc[0].region, sc[0].district].filter(Boolean).join(' ');
        } catch { }
    }
    // 단원 분포는 '과목별'로 분리 (학년·과목 다른 시험을 한 표로 합치면 의미 없음)
    let subjUnits: { subject: string; total: number; units: { unit: string; count: number }[] }[] = [];
    try {
        const qs=await readAllPages<any>((from,to)=>supabase.from('questions').select('subject,unit').eq('school',schoolName).eq('work_status','sorted').order('id').range(from,to));
        if (qs && qs.length) {
            const bySubj: Record<string, Record<string, number>> = {};
            qs.forEach((q: any) => {
                const s = (q.subject || '기타').toString();
                const un = (q.unit || '기타').toString();
                (bySubj[s] = bySubj[s] || {})[un] = (bySubj[s][un] || 0) + 1;
            });
            subjUnits = Object.entries(bySubj).map(([subject, m]) => ({
                subject,
                total: Object.values(m).reduce((a, b) => a + b, 0),
                units: Object.entries(m).map(([unit, count]) => ({ unit, count })).sort((a, b) => b.count - a.count).slice(0, 6),
            })).sort((a, b) => b.total - a.total);
        }
    } catch { }
    const subjects = Array.from(new Set(examList.map((g: any) => g.subject).filter(Boolean)));
    const years = Array.from(new Set(examList.map((g: any) => g.year))).sort((a: number, b: number) => b - a);

    // [강사 섹션용] 이 학교 총 문항 수 + 출제 비중 높은 단원 (없으면 문구에서 자동 생략)
    const totalQuestionCount = subjUnits.reduce((sum, s) => sum + s.total, 0);
    const topUnitNames = Array.from(new Set(subjUnits.flatMap((s) => s.units.slice(0, 2).map((u) => u.unit))))
        .slice(0, 3).join('·');

    // [SEO] 서술 문단 + 구조화 데이터
    const narrative = buildSchoolNarrative(schoolName, region, examList.length, years, subjects, subjUnits, specialIntro);
    const schoolUrl = `https://mathetf.com/school/${encodeURIComponent(schoolName)}`;
    const jsonLd = [
        {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: `${schoolName} 수학 기출문제`,
            description: narrative[0],
            url: schoolUrl,
            inLanguage: 'ko',
            isAccessibleForFree: true,
            about: { '@type': 'Thing', name: '수학 내신 기출문제' },
            provider: { '@type': 'Organization', name: '수학ETF', url: 'https://mathetf.com' },
        },
        {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: '전체 기출', item: 'https://mathetf.com/' },
                { '@type': 'ListItem', position: 2, name: `${schoolName} 수학 기출문제`, item: schoolUrl },
            ],
        },
    ];

    // 새 디자인 목록 줄 — 연도 안에서는 학년·학기·중간→기말 순
    const typeOrder = (t: string) => (t === '중간고사' ? 0 : t === '기말고사' ? 1 : 2);
    const listLocations: SchoolExamLocation[] = locations.map(loc => ({
        key: loc.key,
        label: loc.label,
        items: [...loc.items]
            .sort((a: any, b: any) => b.year - a.year || a.grade - b.grade || a.semester - b.semester || typeOrder(a.examType) - typeOrder(b.examType))
            .map((group: any, idx: number) => {
                const isMock = group.examType === '모의고사' || group.examType === '수능';
                const semLabel = isMock ? `${group.semester}월` : `${group.semester}학기`;
                // 상세페이지(/exam/[id]) 앵커 = 해설 PDF 행
                const detailFile = group.files.find((f: any) => f.file_type === 'PDF' && f.content_type === '해설') || group.files.find((f: any) => f.file_type === 'PDF');
                return {
                    key: `${loc.key}-${idx}`,
                    href: detailFile ? `/exam/${detailFile.id}` : `/?school=${encodeURIComponent(schoolName)}`,
                    year: group.year,
                    grade: Number(group.grade) || 0,
                    title: `${group.year}년 ${group.grade}학년 ${semLabel} ${group.examType}`,
                    subject: group.subject,
                    free: group.files.some((f: any) => !!f.free_pdf_url),
                };
            }),
    }));
    const shortName = shortSchoolName(schoolName);
    const yearText = years.length > 1 ? `${years[years.length - 1]}년부터 ${years[0]}년까지 ` : years.length === 1 ? `${years[0]}년 ` : '';
    const qbHref = `/question-bank?school=${encodeURIComponent(schoolName)}`;

    // 같은 지역 다른 학교 기출 — 학교 페이지끼리 잇는다(자료가 있는 첫 지역 기준)
    let nearby: { school: string; count: number }[] = [];
    const firstLoc = examList[0] as any;
    if (firstLoc?.region && firstLoc?.district && !specialIntro) {
        const { data: near } = await supabase.from('exam_materials')
            .select('school, exam_year, grade, semester, exam_type, subject, title')
            .eq('region', firstLoc.region).eq('district', firstLoc.district).in('content_type', ['해설', '개인DB'])
            .neq('school', schoolName);
        const per: Record<string, Set<string>> = {};
        for (const r of near || []) (per[r.school] ||= new Set()).add(examGroupKey(r as any));
        nearby = Object.entries(per).map(([school, k]) => ({ school, count: k.size }))
            .filter(n => !NOT_A_SCHOOL.has(n.school) && n.school !== 'DELETED').sort((a, b) => b.count - a.count).slice(0, 6);
    }

    return (
        <div className="rd rd-x">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <div>
                <section className="rd-wrap rd-x-top">
                    <Link href="/schools" className="rd-x-back"><ChevronLeft size={18} aria-hidden="true" />학교별 기출 목록</Link>
                    <h1 className="rd-x-h1 rd-s-h1">{schoolName}{' '}<br />수학 기출문제</h1>
                    <p className="rd-lead">
                        {region ? `${region}. ` : ''}{yearText}{totalQuestionCount > 0 ? `시험지 ${examList.length}개, 기출 ${totalQuestionCount.toLocaleString()}문항이 있습니다.` : `시험지 ${examList.length}개가 있습니다.`}
                    </p>
                    <div className="rd-s-actions">
                        <a href="#list" className="rd-btn rd-btn-primary">시험지 보기</a>
                        <Link href={qbHref} className="rd-btn rd-btn-gray">이 학교 기출로 시험지 만들기</Link>
                    </div>
                </section>

                <section id="list" className="rd-wrap rd-s-list">
                    <SchoolExamList locations={listLocations} />
                </section>

                {subjUnits.length > 0 && <section className="rd-s-zone">
                    <SchoolUnits title={`${shortName || schoolName}에서 자주 나온 단원`} subjUnits={subjUnits} />
                </section>}

                <section className="rd-wrap rd-s-about">
                    <h2 className="rd-s-h2sm">{schoolName} 수학 기출 안내</h2>
                    <div className="rd-s-prose">{narrative.map((para, i) => <p key={i}>{para}</p>)}</div>
                </section>

                {/* [강사 유입구] 학교 페이지마다 강사 착지점 */}
                <section id="make" className="rd-wrap rd-s-make">
                    <div className="rd-s-makebox">
                        <h2 className="rd-x-h2">{totalQuestionCount > 0 ? <>{shortName || schoolName} 기출 {totalQuestionCount.toLocaleString()}문항으로<br />시험지를 만드세요</> : <>{shortName || schoolName} 기출로<br />시험지를 만드세요</>}</h2>
                        <p className="rd-lead">출제 단원을 골라 같은 유형의 문항으로 시험지를 만들고, 한글 파일(HML)로 받아 수업에 바로 씁니다.{topUnitNames ? ` 이 학교는 ${topUnitNames.split('·').join(', ')} 단원 출제 비중이 높습니다.` : ''}</p>
                        <ol className="rd-s-steps">
                            <li><b>1</b><span>{shortName || schoolName} 회차를 담고</span></li>
                            <li><b>2</b><span>단원과 난이도로 고르고</span></li>
                            <li><b>3</b><span>한글 파일로 받기</span></li>
                        </ol>
                        <div className="rd-s-actions">
                            <Link href={qbHref} className="rd-btn rd-btn-primary">{shortName || schoolName} 기출로 시험지 만들기</Link>
                            <Link href="/guide" className="rd-link">만드는 순서와 무료 범위 보기</Link>
                            <Link href="/question-bank?demo=1&origin=content" className="rd-link">5문항 체험해 보기</Link>
                        </div>
                    </div>
                </section>

                <section className="rd-x-more rd-s-more" aria-labelledby="school-more-title">
                    <div className="rd-wrap">
                        <h2 id="school-more-title" className="rd-x-h2">{nearby.length > 0 ? `${firstLoc.district} 다른 학교 기출` : '다른 학교 기출도 찾아보세요'}</h2>
                        {nearby.length > 0 && <div className="rd-x-rows">
                            {nearby.map(n => <Link key={n.school} href={`/school/${encodeURIComponent(n.school)}`} className="rd-x-row">
                                <span><b>{n.school}</b><small>시험지 {n.count}개</small></span>
                                <ChevronRight size={22} aria-hidden="true" />
                            </Link>)}
                        </div>}
                        <div className="rd-x-links">
                            <Link href="/schools" className="rd-link">전국 학교별 기출 보기</Link>
                            <Link href="/" className="rd-link">전체 기출 보러 가기</Link>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
