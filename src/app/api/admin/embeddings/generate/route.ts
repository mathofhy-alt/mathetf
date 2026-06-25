import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { generateEmbedding, generateTags } from '@/lib/embeddings';
import { CONCEPT_MAP } from '@/lib/concept-map';
import { canonicalUnit } from '@/lib/curriculum';

const VALID_SUBJECTS = Object.keys(CONCEPT_MAP);

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
            // 30개씩 처리 (병렬화로 속도 개선)
            const { data, error } = await supabase
                .from('questions')
                .select('id, content_xml, plain_text, equation_scripts, subject, grade, school, difficulty, key_concepts, unit, source_db_id')
                .or('embedding.is.null,unit.is.null')
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
                let updatedSubject = q.subject;
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
                        // 실제 시험 과목(source_db_id)으로 과목 고정 — 풀이방법 보고 엉뚱한 과목으로 오분류 방지
                        const lockedSubject = subjectFromSourceDbId(q.source_db_id);
                        const tagData = await generateTags(textToEmbed, q.subject || '수학', imageUrls, lockedSubject);
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
                        if (needsUnit && tagData.unit) updatedUnit = canonicalUnit(tagData.unit) || tagData.unit;
                        if (needsSubject && tagData.subject) updatedSubject = tagData.subject;
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
        for (let i = 0; i < questionsToProcess.length; i += CONCURRENCY) {
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
