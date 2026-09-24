import {unavailableDbs} from '@/lib/questions/scope';
import {questionBankHref, schoolDestination} from '@/lib/discovery';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ExamDetailV2 from '@/components/ExamDetailV2';
import { ExamOpinion } from '@/components/ExamOpinions';
import { buildSourceDbId } from '@/lib/examKey';
import { proxiedOgImage } from '@/lib/og-image';
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

type Composition = { total: number; byUnit: { unit: string; count: number }[]; easy: number; mid: number; hard: number };

// Show only statements that can be checked against the linked questions.
function buildNarrative(label: string, comp: Composition): string[] {
    const top = comp.byUnit.slice(0, 3);
    const topStr = top.map((u) => `${u.unit} ${u.count}문항`).join(', ');
    return [
        `${label}은 총 ${comp.total}문항이며 ${comp.byUnit.length}개 단원에서 출제되었습니다.${topStr ? ` 문항 수가 많은 단원은 ${topStr}입니다.` : ''}`,
        `연결된 문항의 분류 난이도는 쉬움 ${comp.easy}문항, 보통 ${comp.mid}문항, 어려움 ${comp.hard}문항입니다. 이는 학생 성적이나 실제 정답률을 뜻하지 않습니다.`,
    ];
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
            .select('id,file_type,content_type,price')
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
    let composition: Composition | null = null;
    let concepts: string[] = [];  // 유형/개념 태그 (문제 본문은 노출 안 함 — 롱테일 키워드용)
    const sourceKey = buildSourceDbId(row);
    if (sourceKey) {
        const { data: qs } = await supabase
            .from('questions')
            .select('unit, difficulty, key_concepts')
            .eq('source_db_id', sourceKey);
        if (qs && qs.length > 0) {
            const unitMap: Record<string, number> = {};
            const conceptCounts = new Map<string, number>();
            let easy = 0, mid = 0, hard = 0;
            for (const q of qs) {
                const unit = (q.unit || '기타').toString();
                unitMap[unit] = (unitMap[unit] || 0) + 1;
                const d = Number(q.difficulty) || 0;
                // 분류기가 1~3에 몰리는 하향 편향 → 실제 분포(≤2 41%/3-4 35%/≥5 24%) 기준으로 구간 보정
                if (d <= 2) easy++; else if (d <= 4) mid++; else hard++;
                const kc = q.key_concepts;
                const arr = Array.isArray(kc) ? kc : (typeof kc === 'string' ? [kc] : []);
                arr.forEach((c: any) => { const t = String(c).replace(/^#/, '').trim(); if (t) conceptCounts.set(t, (conceptCounts.get(t) || 0) + 1); });
            }
            const byUnit = Object.entries(unitMap)
                .map(([unit, count]) => ({ unit, count }))
                .sort((a, b) => b.count - a.count);
            composition = { total: qs.length, byUnit, easy, mid, hard };
            concepts = Array.from(conceptCounts.entries())
                .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0], 'ko'))
                .map(([concept]) => concept);
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

    // Stored AI prose can mistake a question-difficulty score for student marks.
    // Keep it in the database, but use a concise, verifiable summary on this screen.
    const narrative: string[] = composition ? buildNarrative(label, composition) : [];
    const relatedReport = reportForExam(row);
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
    const paidMaterials = (siblings || []).filter((item: any) => item.content_type === '해설' && (item.file_type === 'PDF' || item.file_type === 'HWP'))
        .map((item: any) => ({ id: item.id as string, type: item.file_type as 'PDF' | 'HWP', price: Number(item.price) || 0 }))
        .sort((a: { type: 'PDF' | 'HWP' }, b: { type: 'PDF' | 'HWP' }) => Number(a.type === 'HWP') - Number(b.type === 'HWP'));
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
            otherYears={otherYears} paidPdfId={paidPdfId} paidMaterials={paidMaterials} opinionExamId={opinionExamId}
            opinions={opinions} narrative={narrative} concepts={concepts} composition={composition}
            relatedExams={relatedExams} relatedReport={relatedReport} />
    </>;

}
