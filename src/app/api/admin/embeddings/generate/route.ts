import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { generateEmbedding } from '@/lib/embeddings';

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
                .select('id, plain_text, equation_scripts, subject, grade, school')
                .in('id', forceIds);

            if (error) throw error;
            questionsToProcess = data || [];
        } else {
            // Processing pending items (embedding is null)
            // Limit to 10 at a time to avoid timeout/rate limits
            const { data, error } = await supabase
                .from('questions')
                .select('id, plain_text, equation_scripts, subject, grade, school')
                .is('embedding', null)
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

        for (const q of questionsToProcess) {
            try {
                // Construct meaningful text for embedding
                // Combine: Subject + Grade + Plain Text + Equations (LaTeX)
                // This gives the model context about the math problem
                const contentParts = [
                    `[과목: ${q.subject || '수학'}]`,
                    `[학년: ${q.grade || '공통'}]`,
                    q.plain_text || '',
                    ...(q.equation_scripts || [])
                ];

                const textToEmbed = contentParts.join(' ').trim();

                if (!textToEmbed) {
                    console.warn(`Question ${q.id} has no content to embed.`);
                    results.push({ id: q.id, status: 'skipped', reason: 'empty_content' });
                    continue;
                }

                // Generate Embedding
                const embedding = await generateEmbedding(textToEmbed);

                // Update DB
                const { error: updateError } = await supabase
                    .from('questions')
                    .update({ embedding })
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

        return NextResponse.json({
            success: true,
            processed: successCount, // Keeping this for backward compatibility
            successCount,
            scannedCount: questionsToProcess.length,
            total: questionsToProcess.length,
            results
        });

    } catch (e: any) {
        console.error("Embedding Generation Error:", e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
