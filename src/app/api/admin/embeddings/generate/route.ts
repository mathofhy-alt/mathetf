import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { generateEmbedding, generateTags } from '@/lib/embeddings';
import { CONCEPT_MAP } from '@/lib/concept-map';
import { canonicalUnit, ALL_SUBJECTS } from '@/lib/curriculum';

// 유효 과목 = 2022(CONCEPT_MAP) + 2015 과목 전부 (source_db_id 과목 인식용)
const VALID_SUBJECTS = Array.from(new Set([...Object.keys(CONCEPT_MAP), ...ALL_SUBJECTS]));
// 2015 과목 → 2022 등가(단원 동일). AI 단원분류는 CONCEPT_MAP(2022)으로 하되 과목은 원래 2015 이름으로 저장.
const SUBJECT_2015_TO_2022: Record<string, string> = {
    '수학(상)': '공통수학1', '수학(하)': '공통수학2', '수학I': '대수', '수학II': '미적분I', '미적분': '미적분II',
};

// [학년 밴드] 과목 잠금이 없을 때(전과목 모의고사 등) AI 후보 과목을 학년으로 제한한다.
// 모의고사는 하위학년 범위도 출제하므로 '누적' 허용하되 상위학년 과목만 배제 → 고1 문제가 대수/미적분으로 찍히는 것 차단.
const GRADE_ALLOWED_SUBJECTS: Record<string, string[]> = {
    '고1': ['공통수학1', '공통수학2'],
    '고2': ['공통수학1', '공통수학2', '대수', '미적분I', '확률과통계'],
    // 고3: 제한 없음(null)
};
function allowedSubjectsForGrade(grade: string | null | undefined): string[] | null {
    const g = String(grade || '').match(/[123]/)?.[0];
    return g ? (GRADE_ALLOWED_SUBJECTS[`고${g}`] || null) : null;
}

/**
 * source_db_id (예: "충암고등학교_2025_1학기기말_공통수학1")의 마지막 토막에서
 * 실제 시험 과목을 뽑는다. CONCEPT_MAP에 있는 과목이면 그걸로 '고정'(신뢰),
 * 아니면(전과목/전과정 등) null → 과목 자동 추론.
 */
function subjectFromSourceDbId(sourceDbId: string | null | undefined): string | null {
    if (!sourceDbId) return null;
    const last = sourceDbId.split('_').pop()?.trim() || '';
    return VALID_SUBJECTS.includes(last) ? last : null;
}

export const dynamic = 'force-dynamic';
// 문항당 Gemini+임베딩이 5~15초 걸림 — 기본 10초 함수 제한에 걸리면 결과 저장 없이 끊겨
// "완료 알림은 뜨는데 안 채워지는" 증상이 됨 → 상한 연장
export const maxDuration = 60;

// [정리] 매 호출마다 디스크(ai-timing.log)에 쓰던 것 제거. (Vercel은 읽기전용이라 무의미 + 로컬 파일만 비대)
const tlog = (msg: string) => {
    console.log(`[${new Date().toISOString()}] ${msg}`);
};


/**
 * POST /api/admin/embeddings/generate
 * 
 * Scans questions that have NULL embeddings and generates them using OpenAI.
 * Can also force update for specific IDs.
 */
import { requireAdmin } from '@/utils/admin-auth';

export async function POST(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    const supabase = createAdminClient();

    try {
        const body = await req.json().catch(() => ({}));
        const { forceIds } = body; // Optional: array of IDs to force update

        let questionsToProcess = [];

        if (forceIds && Array.isArray(forceIds) && forceIds.length > 0) {
            // Processing specific IDs
            const { data, error } = await supabase
                .from('questions')
                .select('id, content_xml, plain_text, equation_scripts, subject, grade, school, difficulty, key_concepts, unit, source_db_id')
                .in('id', forceIds);

            if (error) throw error;
            questionsToProcess = data || [];
        } else {
            // Processing pending items (embedding is null)
            // 최신 파싱분 우선 — 정렬 없이 30개를 집으면 오래된 미처리 행들이 자리를 차지해
            // 방금 올린 문항에 순서가 안 오는 기아 상태가 생김
            const { data, error } = await supabase
                .from('questions')
                .select('id, content_xml, plain_text, equation_scripts, subject, grade, school, difficulty, key_concepts, unit, source_db_id')
                .or('embedding.is.null,unit.is.null')
                .order('created_at', { ascending: false })
                .limit(30);

            if (error) throw error;
            questionsToProcess = data || [];
        }

        if (questionsToProcess.length === 0) {
            return NextResponse.json({
                success: true,
                message: "No questions pending embedding generation.",
                processed: 0
            });
        }

        const results: any[] = [];
        let successCount = 0;
        let totalEmbeddingTokens = 0;
        let totalTagTokens = 0;

        // 문제 처리 함수 (단일 문제)
        const processQuestion = async (q: any) => {
            const t0 = Date.now();
            try {
                const contentParts = [
                    `[과목: ${q.subject || '수학'}]`,
                    `[학년: ${q.grade || '공통'}]`,
                    q.content_xml ? q.content_xml.replace(/<[^>]+>/g, ' ') : (q.plain_text || ''),
                    ...(q.equation_scripts || [])
                ];
                const textToEmbed = contentParts.join(' ').trim();

                if (!textToEmbed) {
                    return { id: q.id, status: 'skipped', reason: 'empty_content' };
                }

                let updatedConcepts = q.key_concepts;
                let updatedUnit = q.unit;
                // source_db_id에 명시된 과목이 있으면 그걸로 고정 (2015 과목 포함) — AI가 못 바꾸게
                const sourceSubject = subjectFromSourceDbId(q.source_db_id);
                let updatedSubject = sourceSubject || q.subject;
                let updatedDifficulty = q.difficulty;
                let extractedTagsForEmbedding = '';

                const isForced = forceIds && Array.isArray(forceIds) && forceIds.includes(q.id);
                const needsTags = isForced || !updatedConcepts || (Array.isArray(updatedConcepts) && updatedConcepts.length === 0) || (typeof updatedConcepts === 'string' && updatedConcepts.trim() === '');
                const needsUnit = isForced || (!updatedUnit || typeof updatedUnit !== 'string' || updatedUnit.trim() === '');
                const needsSubject = isForced || (!updatedSubject || updatedSubject === '전과목' || updatedSubject === '수학');
                const needsDifficulty = isForced || (updatedDifficulty == null || updatedDifficulty === '' || isNaN(Number(updatedDifficulty)));

                if (needsTags || needsUnit || needsSubject || needsDifficulty) {
                    try {
                        // 이미지 병렬 fetch
                        const tImg0 = Date.now();
                        const { data: imgData } = await supabase
                            .from('question_images')
                            .select('data')
                            .eq('question_id', q.id)
                            .order('created_at', { ascending: true });
                        tlog(`[TIMING] ${q.id} | imgDB: ${Date.now() - tImg0}ms (${imgData?.length || 0}개)`);

                        const imageUrls: string[] = imgData ? imgData.map((row: any) => row.data) : [];

                        const tGemini0 = Date.now();
                        // AI 단원 분류는 CONCEPT_MAP(2022) 기준 → 2015 과목은 등가 2022 과목으로 잠가서 분류
                        const aiLockSubject = sourceSubject ? (SUBJECT_2015_TO_2022[sourceSubject] || sourceSubject) : null;
                        // 잠금이 없으면 학년 밴드로 후보 과목 제한 (상위학년 과목 환각 방지)
                        const gradeAllowed = aiLockSubject ? null : allowedSubjectsForGrade(q.grade);
                        const tagData = await generateTags(textToEmbed, aiLockSubject || q.subject || '수학', imageUrls, aiLockSubject, gradeAllowed);
                        tlog(`[TIMING] ${q.id} | Gemini: ${Date.now() - tGemini0}ms | tags:${tagData.tags.length} unit:${tagData.unit}`);
                        const extracted = tagData.tags;
                        totalTagTokens += tagData.tokens || 0;

                        if (needsTags && extracted.length > 0) {
                            updatedConcepts = extracted.map((t: string) => `#${t}`);
                            extractedTagsForEmbedding = extracted.join(', ');
                        } else if (!needsTags && updatedConcepts) {
                            extractedTagsForEmbedding = Array.isArray(updatedConcepts)
                                ? updatedConcepts.map((t: string) => t.replace(/^#/, '')).join(', ')
                                : (typeof updatedConcepts === 'string' ? updatedConcepts.replace(/^#/, '') : '');
                        }
                        // AI가 옛 표기(삼각함수의활용 등)를 뱉어도 표준명으로 정규화 → DB 단원 통일 유지
                        // 과목 전달: '정적분'처럼 과목에 따라 흡수 여부가 갈리는 표기 처리 (미적분II→여러가지적분법)
                        if (needsUnit && tagData.unit) updatedUnit = canonicalUnit(tagData.unit, aiLockSubject || updatedSubject) || tagData.unit;
                        // source 과목이 있으면 절대 AI로 안 바꿈 (2015↔2022 혼동 방지)
                        if (needsSubject && !sourceSubject && tagData.subject) updatedSubject = tagData.subject;
                        if (needsDifficulty && tagData.difficulty != null) updatedDifficulty = tagData.difficulty.toString();
                    } catch (e) {
                        console.error(`Tag generation failed for ${q.id}:`, e);
                    }
                } else {
                    extractedTagsForEmbedding = Array.isArray(updatedConcepts)
                        ? updatedConcepts.map((t: string) => t.replace(/^#/, '')).join(', ')
                        : (typeof updatedConcepts === 'string' ? updatedConcepts.replace(/^#/, '') : '');
                }

                let finalEmbeddingText = textToEmbed;
                if (extractedTagsForEmbedding) {
                    finalEmbeddingText = `[핵심개념태그: ${extractedTagsForEmbedding}]\n${textToEmbed}`;
                }
                const tEmb0 = Date.now();
                const embeddingData = await generateEmbedding(finalEmbeddingText);
                const embedding = embeddingData.embedding;
                totalEmbeddingTokens += embeddingData.tokens || 0;
                tlog(`[TIMING] ${q.id} | OpenAI embed: ${Date.now() - tEmb0}ms`);

                const tDb0 = Date.now();
                const { error: updateError } = await supabase
                    .from('questions')
                    .update({
                        embedding,
                        ...(updatedConcepts !== q.key_concepts ? { key_concepts: updatedConcepts } : {}),
                        ...(updatedUnit !== q.unit ? { unit: updatedUnit } : {}),
                        ...(updatedSubject !== q.subject ? { subject: updatedSubject } : {}),
                        ...(updatedDifficulty !== q.difficulty ? { difficulty: updatedDifficulty } : {})
                    })
                    .eq('id', q.id);
                tlog(`[TIMING] ${q.id} | DB update: ${Date.now() - tDb0}ms | total: ${Date.now() - t0}ms`);

                if (updateError) throw updateError;
                return { id: q.id, status: 'success' };
            } catch (err: any) {
                console.error(`Failed to process question ${q.id}:`, err);
                return { id: q.id, status: 'error', error: err.message };
            }
        };


        // 8개씩 병렬 처리
        // [성능] 동시 처리 개수. Tier 3 한도(4,000+ RPM / 4M+ TPM) 대비 충분히 안전한 16.
        // (호출당 ~12k 토큰 가정 시 16 → 약 2.3M TPM, 192 RPM 수준 — 한도 미달. 정확도는 그대로)
        const CONCURRENCY = 16;
        // [시간 예산] 문항당 Gemini가 5~24초로 편차가 커서, 운이 나쁘면 총 실행이
        // 함수 제한(60초)을 넘겨 강제 종료됨 → 뒤 웨이브 문항들이 통째로 미처리되던 원인.
        // 40초 안에서 처리 가능한 만큼만 돌고 나머지는 다음 클릭이 이어받는다 (완료분 저장 보장).
        const startedAt = Date.now();
        const TIME_BUDGET_MS = 40_000;
        let timeBoxed = false;
        for (let i = 0; i < questionsToProcess.length; i += CONCURRENCY) {
            if (i > 0 && Date.now() - startedAt > TIME_BUDGET_MS) { timeBoxed = true; break; }
            const batch = questionsToProcess.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.allSettled(batch.map(q => processQuestion(q)));
            for (const r of batchResults) {
                const result = r.status === 'fulfilled' ? r.value : { id: 'unknown', status: 'error', error: 'Promise rejected' };
                results.push(result);
                if (result.status === 'success') successCount++;
            }
        }

        // --- [NEW] Sync exam_materials DB price after AI updates difficulty ---
        const successIds = results.filter(r => r.status === 'success').map(r => r.id);
        if (successIds.length > 0) {
            try {
                const { data: updatedQs } = await supabase
                    .from('questions')
                    .select('school, year, grade, semester, subject')
                    .in('id', successIds);
                    
                if (updatedQs && updatedQs.length > 0) {
                    const uniqueGroups = Array.from(new Set(updatedQs.map((q: any) => 
                        `${q.school}|${q.year}|${q.grade}|${q.semester}|${q.subject}`
                    )));

                    for (const groupKey of uniqueGroups) {
                        const [s_school, s_year, s_grade, s_sem, s_sub] = groupKey.split('|');
                        
                        const { data: allQs } = await supabase
                            .from('questions')
                            .select('difficulty')
                            .eq('school', s_school)
                            .eq('year', s_year)
                            .eq('grade', s_grade)
                            .eq('semester', s_sem)
                            .eq('subject', s_sub);
                        
                        if (allQs && allQs.length > 0) {
                            let newPrice = 0;
                            allQs.forEach((q: any) => {
                                const diff = parseInt(String(q.difficulty)) || 1;
                                newPrice += diff * 500;
                            });

                            const gradeNum = Number(String(s_grade).replace(/[^0-9]/g, '')) || 0;
                            let examType = '';
                            if (s_sem.includes('중간')) examType = '중간고사';
                            else if (s_sem.includes('기말')) examType = '기말고사';

                            const shortSchool = String(s_school).replace(/고등학교|고/g, '');
                            
                            let query = supabase
                                .from('exam_materials')
                                .update({ price: newPrice })
                                .eq('content_type', '개인DB')
                                .ilike('school', `%${shortSchool}%`)
                                .eq('exam_year', Number(s_year))
                                .eq('grade', gradeNum)
                                .eq('subject', s_sub);
                            
                            if (examType) query = query.eq('exam_type', examType);
                            await query;
                        }
                    }
                }
            } catch (syncErr) {
                console.error('Failed to sync DB price after AI generation:', syncErr);
            }
        }
        // ----------------------------------------------------------------------

        // Estimate cost: OpenAI text-embedding-3-small ($0.02 / 1M), Gemini 3 Flash Preview ($0.075 / 1M rough equivalent)
        const estimatedCostUsd = (totalEmbeddingTokens / 1000000) * 0.02 + (totalTagTokens / 1000000) * 0.075;

        const responsePayload: any = {
            success: true,
            successCount,
            scannedCount: questionsToProcess.length,
            total: questionsToProcess.length,
            // 시간 예산으로 이번에 못 돈 문항 수 — 다음 클릭이 이어서 처리
            remaining: timeBoxed ? questionsToProcess.length - results.length : 0,
            totalEmbeddingTokens,
            totalTagTokens,
            estimatedCostUsd
        };

        // If something was scanned but nothing succeeded, include the first error to help debug
        if (questionsToProcess.length > 0 && successCount === 0) {
            const firstError = results.find(r => r.status === 'error');
            if (firstError) {
                responsePayload.debug_error = firstError.error;
            }
        }

        return NextResponse.json(responsePayload);

    } catch (e: any) {
        console.error("Embedding Generation Error:", e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
