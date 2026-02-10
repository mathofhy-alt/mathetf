
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

        // 2. Fetch User's Purchased DBs
        const { data: purchases, error: purchaseError } = await supabase
            .from('purchases')
            .select(`
                exam_materials!inner (
                    id, title, school, grade, semester, exam_type, subject, file_type
                )
            `)
            .eq('user_id', user.id)
            .eq('exam_materials.file_type', 'DB');

        if (purchaseError) {
            console.error("Purchase Fetch Error:", purchaseError);
            return NextResponse.json({ success: false, error: 'Failed to fetch purchased databases' }, { status: 500 });
        }

        if (!purchases || purchases.length === 0) {
            return NextResponse.json({ success: false, error: 'No purchased databases found. Please select a database first.' }, { status: 403 });
        }

        const purchasedDbs = purchases.map((p: any) => p.exam_materials);

        // 3. Perform Vector Search via RPC
        const { data: similarQuestions, error: searchError } = await supabase
            .rpc('match_questions', {
                query_embedding: source.embedding,
                match_threshold: 1 - threshold,
                match_count: limit * 20, // Fetch more to allow filtering
                filter_exclude_id: id,
                target_unit: source.unit
            });

        if (searchError) throw searchError;

        // 4. Filter results based on purchased DB metadata
        const metadataFilter = (q: any) => {
            return purchasedDbs.some((db: any) => {
                // School Check
                if (q.school !== db.school) return false;

                // Grade Mapping & Check
                let dbGrade = db.grade;
                if (dbGrade && ['1', '2', '3'].includes(String(dbGrade).replace('고', ''))) {
                    dbGrade = `고${String(dbGrade).replace('고', '')}`;
                }
                if (q.grade !== dbGrade) return false;

                // Year Mapping & Check
                let dbYear = db.exam_year || db.year;
                if (!dbYear && db.title) {
                    const match = db.title.match(/20[0-9]{2}/);
                    if (match) dbYear = match[0];
                }
                if (dbYear && q.year !== dbYear) return false;

                // Semester/ExamType Mapping
                if (db.semester && db.exam_type) {
                    const semNum = String(db.semester).replace('학기', '');
                    const typeShort = db.exam_type.includes('중간') ? '중간' : (db.exam_type.includes('기말') ? '기말' : '');
                    if (typeShort) {
                        const expectedSem = `${semNum}학기${typeShort}`;
                        if (q.semester !== expectedSem) return false;
                    }
                }

                // Subject Check
                if (db.subject && q.subject !== db.subject) return false;

                return true;
            });
        };

        let results = similarQuestions || [];

        // Filter by Purchased DBs
        results = results.filter(metadataFilter);

        // Filter by Unit (Strict matching as requested previously)
        if (source.unit) {
            results = results.filter((q: any) => q.unit === source.unit);
        }

        results = results.slice(0, limit);

        // 5. Fetch images
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
