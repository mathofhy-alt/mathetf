import {unavailableDbs} from '@/lib/questions/scope';
import MaterialReady from '@/components/MaterialReady';
import {schoolDestination} from '@/lib/discovery';
import { createAdminClient } from '@/utils/supabase/server-admin';
import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ExamPreviewCarousel from '@/components/ExamPreviewCarousel';
import FreeProblemCTA from '@/components/FreeProblemCTA';
import Header from '@/components/Header';
import { buildSourceDbId } from '@/lib/examKey';
import { proxiedOgImage } from '@/lib/og-image';
import { HUB_SUBJECTS } from '@/lib/subject-hub';
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
    const isMock = row.exam_type === '모의고사' || row.exam_type === '수능';
    const examShort = `${row.grade ? row.grade + '학년 ' : ''}${isMock ? row.semester + '월' : row.semester + '학기'} ${row.exam_type || ''}`.trim();
    const previews: string[] = Array.isArray(row.preview_urls) ? row.preview_urls : [];

    const hasPdf = siblings.some((f: any) => f.file_type === 'PDF');
    const hasHwp = siblings.some((f: any) => f.file_type === 'HWP');
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

    return (
        <div className="min-h-screen bg-[#F2F3F0] text-[#294437] font-sans">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <Header />
            <div className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
                {/* 헤더 */}
                <div className="mb-6">
                    <Link href={schoolDestination(row.school)} className="text-sm text-brand-600 hover:underline mb-3 inline-block">
                        ← {row.school} 전체 시험지
                    </Link>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 break-keep">
                        {label} 수학 기출문제 및 해설
                    </h1>
                    <MaterialReady row={row} hasDb={hasDb}/>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {row.free_pdf_url&&<span className="text-[11px] bg-emerald-50 text-emerald-600 border border-emerald-100 font-bold px-2.5 py-1 rounded-full">문제 PDF 무료</span>}
                        {hasPdf && <span className="text-[11px] bg-red-50 text-red-500 border border-red-100 font-bold px-2.5 py-1 rounded-full">PDF (문제+해설)</span>}
                        {hasHwp && <span className="text-[11px] bg-[#E7EFD9] text-[#638747] border border-teal-100 font-bold px-2.5 py-1 rounded-full">HWP</span>}
                        {hasDb && <span className="text-[11px] bg-[#EAF1E1] text-[#426D36] border border-brand-100 font-bold px-2.5 py-1 rounded-full">개인DB</span>}
                    </div>
                </div>

                {/* 무료 문제 PDF CTA (회원가입 유도 / 로그인 시 즉시 다운로드) — 페이지 상단 강조 */}
                {row.free_pdf_url && (
                    <FreeProblemCTA
                        examId={row.id}
                        filename={`${row.school}_${row.exam_year}_${row.grade}_${row.semester}_${row.exam_type}_문제.pdf`}
                        pageCount={previews.length}
                        sourceKey={sourceKey}
                        school={row.school}
                    />
                )}

                {/* 설명 텍스트 (SEO + 사용자)
                    [GEO] AI 인용의 44%가 페이지 상위 30%에서 나오고, 첫 40~60자에 사실이 있어야 인용된다.
                    안내 문구 대신 문항 수·단원 같은 구체적 사실을 먼저 놓는다. */}
                <p className="text-slate-600 leading-relaxed break-keep mb-6">
                    <strong className="text-slate-800">{row.school}</strong>의 {row.exam_year}년
                    {row.grade ? ` ${row.grade}학년` : ''} {isMock ? `${row.semester}월` : `${row.semester}학기`} {row.exam_type}
                    {row.subject ? ` ${row.subject}` : ''} 수학 기출문제입니다.
                    {composition && composition.total > 0 && (
                        <> 총 <strong className="text-slate-800">{composition.total}문항</strong>
                            {composition.byUnit.length > 0
                                ? <>이며 {composition.byUnit.slice(0, 3).map((u) => `${u.unit} ${u.count}문항`).join(', ')} 순으로 출제되었습니다.</>
                                : <>입니다.</>}
                        </>
                    )}
                    {' '}실제 시험지 미리보기와 단원·난이도별 구성을 아래에서 확인할 수 있고, 문제·해설 전체는 PDF·HWP·개인DB로 제공합니다.
                </p>

                {/* 시험 분석 서술 (SEO 고유 텍스트 — composition 데이터 기반) */}
                {narrative.length > 0 && (
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
                        <h2 className="text-base font-bold text-slate-800 mb-3">{label} 시험 분석</h2>
                        <div className="space-y-3">
                            {narrative.map((para, i) => (
                                <p key={i} className="text-sm text-slate-600 leading-relaxed break-keep">{para}</p>
                            ))}
                        </div>
                        {pilotAnalysis.length > 0 && <p className="text-xs text-slate-500 mt-3">분석 기준: 현재 등록된 문항의 단원·난이도 자동 분류. 문항 원문·정답·해설은 이 분석에 포함하지 않습니다.</p>}
                    </section>
                )}

                {/* 문제 미리보기 */}
                {previews.length > 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 mb-6">
                        <h2 className="text-sm font-bold text-slate-700 mb-3">📄 문제 미리보기 <span className="text-slate-400 font-normal">(문제 전체 {previews.length}페이지 · 해설 제외)</span></h2>
                        <ExamPreviewCarousel images={previews} label={label} />
                        <p className="text-xs text-slate-400 mt-3 text-center">해설은 다운로드로 제공됩니다.</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 mb-6 text-center text-slate-400 text-sm">
                        미리보기 준비 중입니다.
                    </div>
                )}

                {/* [퍼널 2026-08-30] 시험지 상세 → 출제 도구 바로가기.
                    유입의 대부분이 네이버 정확매칭 검색("2025 낙생고 1-2 중간고사")으로 이 페이지에
                    곧장 떨어지는데, 여기서 출제 도구로 가는 길이 홈으로 보내는 링크뿐이었다.
                    도구에 들어가도 빈 화면이라 검색부터 다시 시작해야 했다(완주율 20%). */}
                {sourceKey && composition && composition.total > 0 && (
                    <Link
                        href={`/question-bank?src=${encodeURIComponent(sourceKey)}&origin=exam`}
                        className="flex items-center justify-between gap-3 bg-white rounded-2xl border-2 border-[#9BD4D2] shadow-sm p-5 mb-6 hover:border-[#638747] transition-colors"
                    >
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-[#294437] break-keep">
                                이 시험지 {composition.total}문항으로 나만의 시험지 만들기
                            </p>
                            <p className="text-xs text-slate-400 mt-1 break-keep">
                                문항이 담긴 채로 시작합니다. 빼고 더하고 순서를 바꿔 한글(HWP)로 받으세요. 현재 무료입니다.
                            </p>
                        </div>
                        <span className="shrink-0 text-sm font-extrabold text-[#638747]">만들기 →</span>
                    </Link>
                )}

                {/* 시험 구성 (단원별·난이도별 문항수) */}
                {composition && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
                        <h2 className="text-sm font-bold text-slate-700 mb-3">📊 시험 구성</h2>
                        <p className="text-sm text-slate-600 mb-4 break-keep">
                            총 <strong className="text-[#294437]">{composition.total}문항</strong> · 출제 단원{' '}
                            <strong className="text-[#294437]">{composition.byUnit.length}개</strong> · 평균 난이도{' '}
                            <strong className="text-[#294437]">{composition.avg.toFixed(1)}/10</strong>
                        </p>

                        {/* 단원별 문항수 */}
                        <table className="w-full text-sm mb-4">
                            <thead>
                                <tr className="text-slate-400 text-xs border-b border-slate-100">
                                    <th className="text-left font-medium pb-2">출제 단원</th>
                                    <th className="text-right font-medium pb-2 w-20">문항수</th>
                                </tr>
                            </thead>
                            <tbody>
                                {composition.byUnit.map((u) => (
                                    <tr key={u.unit} className="border-b border-slate-50 last:border-0">
                                        <td className="py-2 text-slate-700">{u.unit}</td>
                                        <td className="py-2 text-right">
                                            <span className="inline-flex items-center gap-2 justify-end">
                                                <span className="inline-block h-1.5 rounded-full bg-[#426D36]/30" style={{ width: `${Math.max(8, (u.count / composition.total) * 80)}px` }} />
                                                <span className="font-bold text-[#426D36] w-5 text-right">{u.count}</span>
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* 난이도 분포 */}
                        <div className="flex flex-wrap gap-2 text-xs">
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 font-bold">쉬움 {composition.easy}</span>
                            <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 font-bold">보통 {composition.mid}</span>
                            <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 font-bold">어려움 {composition.hard}</span>
                        </div>
                    </div>
                )}

                {/* 출제 개념·유형 (롱테일 키워드 — 문제 본문은 비공개) */}
                {concepts && concepts.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
                        <h2 className="text-sm font-bold text-slate-700 mb-1">🧩 출제 개념·유형</h2>
                        <p className="text-xs text-slate-400 mb-3 break-keep">
                            {label} 시험지에서 다루는 주요 개념·문제 유형입니다.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {concepts.map((c: string) => (
                                <span key={c} className="text-[12px] bg-[#EAF1E1] text-[#294437] border border-[#C5D8B5]/60 px-2.5 py-1 rounded-full">
                                    {c}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* 다운로드 CTA */}
                <div className="library-cta bg-[#20354F] rounded-2xl p-6 text-center text-white shadow-md">
                    <p className="font-bold text-lg mb-1">문제 + 해설 전체 받기</p>
                    <p className="text-white/85 text-sm mb-4 break-keep">{label} 시험지의 전체 문제와 해설을 받아보세요.</p>
                    <Link
                        href={`/#material=${siblings.find((s: any) => s.file_type === 'PDF' && s.content_type === '해설')?.id || row.id}`}
                        // 홈의 정확한 회차 카드로 이동한다. 프래그먼트는 중복 검색 URL을 만들지 않는다.
                        rel="nofollow"
                        className="inline-block bg-white text-[#426D36] font-extrabold px-6 py-3 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                        다운로드 하러 가기
                    </Link>
                </div>

                {/* 같은 시험 · 다른 연도 */}
                {otherYears.length > 0 && (
                    <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <h2 className="text-sm font-bold text-slate-700 mb-3">
                            📚 {row.school} {examShort} · 다른 연도
                        </h2>
                        <div className="flex flex-wrap gap-2">
                            {otherYears.map((r: any) => (
                                <Link
                                    key={r.id}
                                    href={`/exam/${r.id}`}
                                    className="text-sm font-bold text-[#426D36] bg-[#EAF1E1] hover:bg-[#DCE9F8] px-3.5 py-2 rounded-lg transition-colors"
                                >
                                    {r.exam_year}년 기출
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {relatedExams.length > 0 && (
                    <section className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <h2 className="text-sm font-bold text-slate-700 mb-3">{row.school}의 관련 시험지</h2>
                        <ul className="space-y-2">
                            {relatedExams.map((item: any) => (
                                <li key={item.id}>
                                    <Link href={`/exam/${item.id}`} className="text-sm font-semibold text-[#426D36] hover:underline">
                                        {buildLabel(item)} 기출문제 →
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {relatedReport && composition && previews.length > 0 && (
                    <Link href={`/insights/${relatedReport.slug}`} className="mt-6 block bg-white rounded-2xl border border-slate-200 p-5 text-sm text-[#426D36] font-semibold hover:underline">
                        {relatedReport.title} · 출제 동향 데이터 보기 →
                    </Link>
                )}

                {/* 하단 링크 */}
                <div className="mt-8 text-center">
                    {row.subject && HUB_SUBJECTS.includes(row.subject) && (
                        <Link href={`/subject/${encodeURIComponent(row.subject)}`} className="text-sm text-slate-500 hover:text-brand-600 hover:underline mr-4">
                            {row.subject} 기출 모아 보기 →
                        </Link>
                    )}
                    <Link href="/schools" className="text-sm text-slate-500 hover:text-brand-600 hover:underline">
                        전국 학교별 기출 자료 모두 보기 →
                    </Link>
                </div>
            </div>
        </div>
    );
}
