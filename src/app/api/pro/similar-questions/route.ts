
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/pro/similar-questions?id={questionId}&limit={limit}
 * 
 * Finds questions similar to the given questionId using vector similarity.
 * Authenticated for Pro users.
 */
export async function GET(req: NextRequest) {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const limit = parseInt(searchParams.get('limit') || '5');
    const threshold = parseFloat(searchParams.get('threshold') || '0.5');

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
            return NextResponse.json({ success: false, error: 'Source question not found' }, { status: 404 });
        }

        if (!source.embedding) {
            return NextResponse.json({
                success: false,
                error: 'Vector embedding not generated for this question.'
            }, { status: 400 });
        }

        // 2. Perform Vector Search via RPC
        // We prioritize questions from the same unit.
        const { data: similarQuestions, error: searchError } = await supabase
            .rpc('match_questions', {
                query_embedding: source.embedding,
                match_threshold: 1 - threshold,
                match_count: limit * 10, // Fetch more to allow filtering
                filter_exclude_id: id,
                // Optional: Pass target unit if we want strict filtering, 
                // but usually similarity takes care of it. 
                // Let's pass it to boost/filter if the RPC supports it.
                // Based on admin route, RPC signature supports target_unit.
                target_unit: source.unit
            });

        if (searchError) throw searchError;

        // Filter and Slice
        // We enforce strict unit matching in post-processing as requested by the user.
        // Even though we pass target_unit to RPC, we double-check here to be sure.
        let results = similarQuestions || [];

        if (source.unit) {
            results = results.filter((q: any) => q.unit === source.unit);
        }

        results = results.slice(0, limit);

        // 3. Fetch images
        if (results.length > 0) {
            const resultIds = results.map((r: any) => r.id);
            const { data: images } = await supabase
                .from('question_images')
                .select('*')
                .in('question_id', resultIds);

            // Attach images
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
