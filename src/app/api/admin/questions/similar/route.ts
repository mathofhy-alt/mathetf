import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

/**
 * GET /api/admin/questions/similar?id={questionId}&limit={limit}
 * 
 * Finds questions similar to the given questionId using vector similarity (cosine distance).
 * Uses pgvector's <=> operator.
 */
export async function GET(req: NextRequest) {
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
            .select('embedding, plain_text')
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
                match_count: limit + 1, // Fetch 1 more to exclude itself
                target_grade: grade, // Pass as target for boosting
                target_unit: unit,   // Pass as target for boosting
                filter_exclude_id: id
            });

        if (searchError) throw searchError;

        // Filter out the source question itself and map results
        const results = similarQuestions
            .filter((q: any) => q.id !== id)
            .slice(0, limit);

        return NextResponse.json({
            success: true,
            data: results
        });

    } catch (e: any) {
        console.error("Similarity Search Error:", e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
