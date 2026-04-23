import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { generateEmbedding, generateTags } from '@/lib/embeddings';

export const dynamic = 'force-dynamic';

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
                .select('id, content_xml, plain_text, equation_scripts, subject, grade, school, difficulty, key_concepts, unit')
                .in('id', forceIds);

            if (error) throw error;
            questionsToProcess = data || [];
        } else {
            // Processing pending items (embedding is null)
            // Limit to 10 at a time to avoid timeout/rate limits
            const { data, error } = await supabase
                .from('questions')
                .select('id, content_xml, plain_text, equation_scripts, subject, grade, school, difficulty, key_concepts, unit')
                .or('embedding.is.null,unit.is.null')
                .limit(10);

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

        const results = [];
        let successCount = 0;
        let totalEmbeddingTokens = 0;
        let totalTagTokens = 0;

        for (const q of questionsToProcess) {
            try {

                // 1. Construct text for embedding
                // Combine: Subject + Grade + Plain Text + Equations (LaTeX)
                // This gives the model context about the math problem
                const contentParts = [
                    `[과목: ${q.subject || '수학'}]`,
                    `[학년: ${q.grade || '공통'}]`,
                    q.content_xml ? q.content_xml.replace(/<[^>]+>/g, ' ') : (q.plain_text || ''),
                    ...(q.equation_scripts || [])
                ];

                const textToEmbed = contentParts.join(' ').trim();

                if (!textToEmbed) {
                    console.warn(`Question ${q.id} has no content to embed.`);
                    results.push({ id: q.id, status: 'skipped', reason: 'empty_content' });
                    continue;
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

                // 3. Generate Tags First
                if (needsTags || needsUnit || needsSubject || needsDifficulty) {
                    try {
                        let imageUrls: string[] = [];
                        const { data: imgData } = await supabase
                            .from('question_images')
                            .select('data')
                            .eq('question_id', q.id)
                            .order('created_at', { ascending: true });
                        if (imgData && imgData.length > 0) {
                            imageUrls = imgData.map(row => row.data);
                        }

                        const tagData = await generateTags(textToEmbed, q.subject || '수학', imageUrls);
                        const extracted = tagData.tags;
                        totalTagTokens += tagData.tokens || 0;

                        if (needsTags && extracted.length > 0) {
                            // Add '#' prefix as required by the frontend/DB convention
                            updatedConcepts = extracted.map((t: string) => `#${t}`);
                            extractedTagsForEmbedding = extracted.join(', '); // 임베딩 가중치용
                        } else if (!needsTags && updatedConcepts) {
                            // Keep existing concepts for embedding weight
                            extractedTagsForEmbedding = Array.isArray(updatedConcepts) 
                                ? updatedConcepts.map((t: string) => t.replace(/^#/, '')).join(', ')
                                : (typeof updatedConcepts === 'string' ? updatedConcepts.replace(/^#/, '') : '');
                        }
                        
                        if (needsUnit && tagData.unit) {
                            updatedUnit = tagData.unit;
                        }
                        
                        if (needsSubject && tagData.subject) {
                            updatedSubject = tagData.subject;
                        }
                        
                        if (needsDifficulty && tagData.difficulty != null) {
                            updatedDifficulty = tagData.difficulty.toString();
                        }
                    } catch (e) {
                        console.error(`Tag generation failed for ${q.id}:`, e);
                    }
                } else {
                    // 이미 태그와 단원 모두 존재
                    extractedTagsForEmbedding = Array.isArray(updatedConcepts) 
                        ? updatedConcepts.map((t: string) => t.replace(/^#/, '')).join(', ')
                        : (typeof updatedConcepts === 'string' ? updatedConcepts.replace(/^#/, '') : '');
                }

                // 4. Generate Embedding with Tag Hints
                // 태그 텍스트를 최상단에 강제로 주입하여 유사도 망(Map)을 형성
                let finalEmbeddingText = textToEmbed;
                if (extractedTagsForEmbedding) {
                    finalEmbeddingText = `[핵심개념태그: ${extractedTagsForEmbedding}]\n${textToEmbed}`;
                }
                const embeddingData = await generateEmbedding(finalEmbeddingText);
                const embedding = embeddingData.embedding;
                totalEmbeddingTokens += embeddingData.tokens || 0;

                // 4. Update DB
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

                if (updateError) throw updateError;

                successCount++;
                results.push({ id: q.id, status: 'success' });

                // Rate limit safety delay (optional, but good for stability)
                await new Promise(r => setTimeout(r, 100));

            } catch (err: any) {
                console.error(`Failed to process question ${q.id}:`, err);
                results.push({ id: q.id, status: 'error', error: err.message });
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
