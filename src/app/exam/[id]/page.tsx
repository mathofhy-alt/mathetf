import {unavailableDbs} from '@/lib/questions/scope';
import {questionBankHref, schoolDestination} from '@/lib/discovery';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ExamDetailV2 from '@/components/ExamDetailV2';
import { ExamOpinion } from '@/components/ExamOpinions';
import { buildSourceDbId } from '@/lib/examKey';
import { proxiedOgImage } from '@/lib/og-image';
import { buildSeoPilotAnalysis, SEO_EXAM_PILOT_IDS } from '@/lib/seo-exam-pilot';
import { reportForExam } from '@/lib/seo-insights';

export const revalidate = 3600; // 1시간마다 갱신 (미리보기/가격 반영)

interface Props {
    params: { id: string };
}

// 시험 라벨 (중간/기말 → N학기, 모의 → N월)
function buildLabel(row: any) {
    const isMock = row.exam_type === '모의고사' || row.exam_type === '수능';
    const sem = isMock ? `${row.semester}월` : `${row.semester}학기`;
    const grade = row.grade ? `${row.grade}학년 ` : '';
    const subject = row.subject ? ` ${row.subject}` : '';
    return `${row.school} ${row.exam_year}년 ${grade}${sem} ${row.exam_type || ''}${subject}`.replace(/\s+/g, ' ').trim();
}

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

type Composition = { total: number; byUnit: { unit: string; count: number }[]; avg: number; easy: number; mid: number; hard: number };

// [SEO] 시험 구성 데이터를 고유 서술형 문단으로 변환 (얇은 콘텐츠 방지 — 표는 그대로 두고 글도 제공)
function buildNarrative(label: string, comp: Composition, concepts: string[]): string[] {
    const paras: string[] = [];
    const top = comp.byUnit.slice(0, 3);
    const topStr = top.map((u) => `${u.unit} ${u.count}문항(${pct(u.count, comp.total)}%)`).join(', ');
    const diffLabel = comp.avg <= 3 ? '평이한 편' : comp.avg <= 5 ? '중간 수준' : '높은 편';

    paras.push(
        `${label} 수학 시험은 총 ${comp.total}문항으로, ${comp.byUnit.length}개 단원에 걸쳐 출제되었습니다. ` +
        `평균 난이도는 10점 만점에 약 ${comp.avg.toFixed(1)}점으로 ${diffLabel}입니다. ` +
        `아래에서 실제 시험지 문제 미리보기와 단원별·난이도별 출제 구성을 모두 확인할 수 있습니다.`
    );

    if (top.length > 0) {
        paras.push(
            `출제 비중이 가장 높은 단원은 ${topStr}입니다. ` +
            `${top[0].unit} 단원의 비중이 가장 크므로, 이 단원의 개념과 대표 유형을 먼저 정리한 뒤 나머지 단원으로 넓혀가는 학습 순서가 효율적입니다.`
        );
    }

    paras.push(
        `난이도 분포는 쉬움 ${comp.easy}문항(${pct(comp.easy, comp.total)}%), 보통 ${comp.mid}문항(${pct(comp.mid, comp.total)}%), 어려움 ${comp.hard}문항(${pct(comp.hard, comp.total)}%)으로 구성됩니다. ` +
        (comp.hard > 0
            ? `어려움으로 분류된 ${comp.hard}문항이 등급을 가르는 변별 문항이므로, 기본기를 빠르게 확보한 뒤 이 상위 문항 유형에 시간을 집중하는 전략이 유효합니다.`
            : `기본·중급 문항 위주라 개념과 대표 유형을 정확히 익히면 안정적으로 고득점을 노릴 수 있습니다.`)
    );

    if (concepts.length > 0) {
        paras.push(
            `주요 출제 개념·유형으로는 ${concepts.slice(0, 10).join(', ')} 등이 있습니다. ` +
            `같은 유형의 변형문제로 반복 연습하면 실전에서 풀이 시간을 단축할 수 있습니다.`
        );
    }

    return paras;
}

async function getExam(id: string) {
    const supabase = createAdminClient();
    const { data: row } = await supabase
        .from('exam_materials')
        .select('*')
        .eq('id', id)
        .neq('school', 'DELETED')
        .single();
    if (!row) return null;
    // subject가 null인 행은 .eq('subject','')로 매칭이 안 됨 → null은 is()로 매칭
    const matchSubject = (q: any) => (row.subject ? q.eq('subject', row.subject) : q.is('subject', null));
    const matchLocation = (q: any) => {
        let query = q;
        if (row.region) query = query.eq('region', row.region);
        if (row.district) query = query.eq('district', row.district);
        return query;
    };

    // 같은 시험의 다른 형식(HWP/개인DB) 확인
    const { data: siblings } = await matchLocation(matchSubject(
        supabase
            .from('exam_materials')
            .select('id,file_type,content_type')
            .eq('school', row.school)
            .eq('exam_year', row.exam_year)
            .eq('grade', row.grade)
            .eq('semester', row.semester)
            .eq('exam_type', row.exam_type)
    )).neq('school', 'DELETED');

    // 같은 학교·같은 시험(학년·학기·시험·과목)의 다른 연도 → 상세페이지 링크
    const { data: otherYears } = await matchLocation(matchSubject(
        supabase
            .from('exam_materials')
            .select('id, exam_year')
            .eq('school', row.school)
            .eq('grade', row.grade)
            .eq('semester', row.semester)
            .eq('exam_type', row.exam_type)
    ))
        .eq('file_type', 'PDF')
        .eq('content_type', '해설')
        .neq('id', row.id)
        .neq('school', 'DELETED')
        .order('exam_year', { ascending: false });

    // 같은 연도 시리즈가 없는 시험도 학교의 실제 다른 회차로 이어 준다.
    const { data: schoolExams } = await matchLocation(supabase
        .from('exam_materials')
        .select('id, school, region, district, exam_year, grade, semester, exam_type, subject')
        .eq('school', row.school)
        .eq('file_type', 'PDF')
        .eq('content_type', '해설'))
        .neq('id', row.id)
        .neq('school', 'DELETED')
        .order('exam_year', { ascending: false })
        .limit(100);
    const yearIds = new Set((otherYears || []).map((item: any) => item.id));
    const relatedExams = (schoolExams || [])
        .filter((item: any) => !yearIds.has(item.id)
            && (!row.region || item.region === row.region)
            && (!row.district || item.district === row.district))
        .sort((a: any, b: any) =>
            Number(b.subject === row.subject) - Number(a.subject === row.subject)
            || Number(b.grade === row.grade) - Number(a.grade === row.grade)
            || Math.abs(Number(row.exam_year) - Number(a.exam_year)) - Math.abs(Number(row.exam_year) - Number(b.exam_year)))
        .slice(0, 4);

    // 시험 구성(단원별·난이도별 문항수) + 출제 개념/유형(key_concepts) — source_db_id 로 questions 조회
    let composition: null | { total: number; byUnit: { unit: string; count: number }[]; avg: number; easy: number; mid: number; hard: number } = null;
    let concepts: string[] = [];  // 유형/개념 태그 (문제 본문은 노출 안 함 — 롱테일 키워드용)
    const sourceKey = buildSourceDbId(row);
    if (sourceKey) {
        const { data: qs } = await supabase
            .from('questions')
            .select('unit, difficulty, key_concepts')
            .eq('source_db_id', sourceKey);
        if (qs && qs.length > 0) {
            const unitMap: Record<string, number> = {};
            const conceptSet = new Set<string>();
            let diffSum = 0, easy = 0, mid = 0, hard = 0;
            for (const q of qs) {
                const unit = (q.unit || '기타').toString();
                unitMap[unit] = (unitMap[unit] || 0) + 1;
                const d = Number(q.difficulty) || 0;
                diffSum += d;
                // 분류기가 1~3에 몰리는 하향 편향 → 실제 분포(≤2 41%/3-4 35%/≥5 24%) 기준으로 구간 보정
                if (d <= 2) easy++; else if (d <= 4) mid++; else hard++;
                const kc = q.key_concepts;
                const arr = Array.isArray(kc) ? kc : (typeof kc === 'string' ? [kc] : []);
                arr.forEach((c: any) => { const t = String(c).replace(/^#/, '').trim(); if (t) conceptSet.add(t); });
            }
            const byUnit = Object.entries(unitMap)
                .map(([unit, count]) => ({ unit, count }))
                .sort((a, b) => b.count - a.count);
            composition = { total: qs.length, byUnit, avg: diffSum / qs.length, easy, mid, hard };
            concepts = Array.from(conceptSet);
        }
    }

    return { row, siblings: siblings || [], otherYears: otherYears || [], relatedExams, composition, concepts, sourceKey };
}

// 빌드 시 실제 해설 PDF 시험만 미리 생성
export async function generateStaticParams() {
    const supabase = createAdminClient();
    const ids: string[] = [];
    for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
            .from('exam_materials')
            .select('id')
            .eq('file_type', 'PDF')
            .eq('content_type', '해설')
            .neq('school', 'DELETED')
            .order('id')
            .range(offset, offset + 999);
        if (error) throw error;
        ids.push(...(data || []).map((r: any) => r.id));
        if (!data || data.length < 1000) break;
    }
    return ids.map(id => ({ id }));
}

/**
 * [SEO] 한 회차는 개인DB·해설PDF·해설HWP 세 자료가 각각 페이지를 갖는다.
 * 전부 같은 title 을 쓰던 탓에 1,378개 중 1,272개(92%)가 중복 제목이었고
 * 네이버 서치어드바이저가 'title 중복 문서' 로, 구글은 '중복 페이지' 로 지적했다(8/18).
 * → 자료 유형을 제목에 드러내 문서마다 다른 title 을 갖게 한다.
 */
function typeSuffix(row: any): { title: string; desc: string } {
    const ft = row.file_type;
    const ct = row.content_type;
    if (ft === 'DB') return { title: '문제은행 DB', desc: '문항을 단원·난이도별로 골라 나만의 시험지로 재구성할 수 있습니다.' };
    if (ft === 'HWP') return { title: '한글(HWP) 파일', desc: '한글 파일이라 문항을 편집해 수업 자료로 바로 쓸 수 있습니다.' };
    if (ft === 'PDF' && ct === '문제') return { title: '문제 PDF', desc: '문제만 담긴 PDF로 인쇄해 바로 풀어볼 수 있습니다.' };
    if (ft === 'PDF') return { title: '문제·해설 PDF', desc: '문제와 해설이 함께 담긴 PDF입니다.' };
    return { title: '기출자료', desc: '' };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const ex = await getExam(params.id);
    if (!ex) return { title: '시험지 | 수학ETF' };
    const label = buildLabel(ex.row);
    const sfx = typeSuffix(ex.row);
    const title = `${label} 수학 기출 ${sfx.title} | 수학ETF`;
    const description = `${label} 수학 기출문제. ${sfx.desc} 실제 시험지 미리보기를 확인하고 받아보세요.`;
    // [2026-09-14] 해설이 없는 회차(원본제보만 있음)는 색인에서 뺀다.
    //   제목은 "문제·해설 PDF" 인데 본문은 "미리보기 준비 중" 뿐이라 얇은 페이지다. 페이지 자체는 남긴다(제보 확인용).
    const hasSolution = ex.siblings.some((s: any) => s.content_type === '해설' || s.content_type === '개인DB');
    const hasPreview = Array.isArray(ex.row.preview_urls) && ex.row.preview_urls.length > 0;
    return {
        title,
        description,
        ...(hasSolution && hasPreview ? {} : { robots: { index: false, follow: true } }),
        keywords: [
            `${ex.row.school} 수학 기출`, `${ex.row.school} ${ex.row.exam_year} 수학`,
            `${ex.row.school} ${ex.row.exam_type}`, `${ex.row.subject || ''} 기출문제`,
            '수학 내신 기출문제', '수학 시험지',
        ].filter(Boolean),
        alternates: { canonical: `/exam/${params.id}` },
        openGraph: {
            title, description, url: `https://mathetf.com/exam/${params.id}`, type: 'article',
            images: [(Array.isArray(ex.row.preview_urls) && ex.row.preview_urls[0]) ? proxiedOgImage(ex.row.preview_urls[0]) : '/og-image.png'],
        },
    };
}

export default async function ExamDetailPage({ params }: Props) {
    const ex = await getExam(params.id);
    if (!ex) notFound();
    const { row, siblings, otherYears, relatedExams, composition, concepts, sourceKey } = ex;
    const label = buildLabel(row);
    const previews: string[] = Array.isArray(row.preview_urls) ? row.preview_urls : [];

    const hasDb = siblings.some((f: any) => f.file_type === 'DB'&&!unavailableDbs[f.id]);

    // [SEO] 서술 문단 — 제미나이 배치가 생성한 고유 분석글(ai_analysis) 우선, 없으면 템플릿 폴백
    const templateNarrative: string[] = composition ? buildNarrative(label, composition, concepts) : [];
    const aiParas: string[] = typeof row.ai_analysis === 'string' && row.ai_analysis.trim()
        ? row.ai_analysis.trim().split(/\n{2,}|\r?\n/).map((s: string) => s.trim()).filter((s: string) => Boolean(s))
        : [];
    const relatedReport = reportForExam(row);
    const benchmark = relatedReport?.groups.find(group => group.label.includes(row.exam_type?.includes('중간') ? '중간' : '기말'));
    const pilotAnalysis = composition && SEO_EXAM_PILOT_IDS.has(row.id) ? buildSeoPilotAnalysis(composition, benchmark) : [];
    const narrative: string[] = pilotAnalysis.length > 0 ? pilotAnalysis : aiParas.length > 0 ? aiParas : templateNarrative;
    const url = `https://mathetf.com/exam/${params.id}`;
    const jsonLd = [
        {
            '@context': 'https://schema.org',
            '@type': 'LearningResource',
            name: `${label} 수학 기출문제 미리보기`,
            description: `${label} 문제 미리보기는 전체 공개됩니다. 문제만 있는 PDF는 로그인 회원에게 무료이며, 해설 포함 자료는 별도 제공됩니다. ${narrative[0] || ''}`.trim(),
            url,
            learningResourceType: '기출문제',
            educationalUse: '시험 대비',
            educationalLevel: row.grade ? `${row.grade}학년` : '고등학교',
            about: { '@type': 'Thing', name: row.subject ? `수학 ${row.subject}` : '수학' },
            inLanguage: 'ko',
            isAccessibleForFree: true,
            provider: { '@type': 'Organization', name: '수학ETF', url: 'https://mathetf.com' },
            ...(row.exam_year ? { dateCreated: String(row.exam_year) } : {}),
            ...(previews.length ? { image: previews } : {}),
        },
        {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: '전체 기출', item: 'https://mathetf.com/' },
                { '@type': 'ListItem', position: 2, name: `${row.school} 수학 기출문제`, item: `https://mathetf.com${schoolDestination(row.school)}` },
                { '@type': 'ListItem', position: 3, name: `${label} 수학 기출문제 및 해설`, item: url },
            ],
        },
    ];

    const paidPdfId = siblings.find((item: any) => item.file_type === 'PDF' && item.content_type === '해설')?.id || null;
    const hasSolutionMaterial = siblings.some((item: any) => item.content_type === '해설' && (item.file_type === 'PDF' || item.file_type === 'HWP'));
    const canStartWithQuestions = hasDb && !!sourceKey && !!composition?.total;
    const createHref = canStartWithQuestions
        ? `/question-bank?src=${encodeURIComponent(sourceKey)}&origin=exam`
        : questionBankHref({ material: row.id, origin: 'exam' });
    const opinionExamId = paidPdfId && composition?.total ? paidPdfId : null;
    let opinions: ExamOpinion[] = [];
    if (opinionExamId) {
        const { data } = await createAdminClient().from('exam_opinions')
            .select('question_number, reason, comment, created_at')
            .eq('exam_id', opinionExamId).eq('hidden', false)
            .order('created_at', { ascending: false }).limit(200);
        opinions = data || [];
    }

    return <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <ExamDetailV2 row={row} previews={previews} questionCount={composition?.total || null}
            sourceKey={sourceKey} hasDb={hasDb} hasSolutionMaterial={hasSolutionMaterial}
            canStartWithQuestions={canStartWithQuestions} createHref={createHref}
            otherYears={otherYears} paidPdfId={paidPdfId} opinionExamId={opinionExamId}
            opinions={opinions} narrative={narrative} concepts={concepts} composition={composition}
            relatedExams={relatedExams} relatedReport={relatedReport} />
    </>;

}
