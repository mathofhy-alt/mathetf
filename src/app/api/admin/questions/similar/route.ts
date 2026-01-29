import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

/**
 * GET /api/admin/questions/similar?id={questionId}&limit={limit}
 * 
 * Finds questions similar to the given questionId using vector similarity (cosine distance).
 * Uses pgvector's <=> operator.
 */
import { requireAdmin } from '@/utils/admin-auth';

export async function GET(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const limit = parseInt(searchParams.get('limit') || '5');
    const threshold = parseFloat(searchParams.get('threshold') || '0.5');

    // Filters
    const grade = searchParams.get('grade') || null;
    const unit = searchParams.get('unit') || null;

    if (!id) {
        return NextResponse.json({ success: false, error: 'Missing question ID' }, { status: 400 });
    }

    try {
        // 1. Get the embedding of the source question
        const { data: source, error: sourceError } = await supabase
            .from('questions')
            .select('embedding, plain_text, unit')
            .eq('id', id)
            .single();

        if (sourceError || !source) {
            return NextResponse.json({ success: false, error: 'Source question not found or has no embedding' }, { status: 404 });
        }

        if (!source.embedding) {
            // If embedding is missing, we might want to trigger generation on the fly?
            // For now, just return error asking to generate first.
            return NextResponse.json({
                success: false,
                error: 'Vector embedding not generated for this question. Please run embedding generation first.'
            }, { status: 400 });
        }

        // 2. Perform Vector Search (Weighted Sorting)
        const { data: similarQuestions, error: searchError } = await supabase
            .rpc('match_questions', {
                query_embedding: source.embedding,
                match_threshold: 1 - threshold, // Supabase often uses 1 - distance for similarity (1 is identical)
                match_count: limit * 10, // Fetch more to allow for filtering
                target_grade: grade, // Pass as target for boosting
                target_unit: source.unit || unit,   // Pass as target for boosting (prioritize source unit)
                filter_exclude_id: id
            });

        if (searchError) throw searchError;

        // Filter out the source question itself AND enforce unit match
        const results = similarQuestions
            .filter((q: any) => q.id !== id && (!source.unit || q.unit === source.unit))
            .slice(0, limit);

        // 3. Fetch images for these questions (since RPC might not return them or if it does, check structure)
        // RPC normally returns columns specified in function or * if generic return query.
        // Assuming match_questions returns a subset or we want to be sure. 
        // Let's fetch images for these IDs manually to be safe and accurate.
        if (results.length > 0) {
            const resultIds = results.map((r: any) => r.id);
            const { data: images } = await supabase
                .from('question_images')
                .select('*')
                .in('question_id', resultIds);

            // Attach images to results
            results.forEach((r: any) => {
                r.question_images = images?.filter((img: any) => img.question_id === r.id) || [];
            });
        }

        return NextResponse.json({
            success: true,
            data: results
        });

    } catch (e: any) {
        console.error("Similarity Search Error:", e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
