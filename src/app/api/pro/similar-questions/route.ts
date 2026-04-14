
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

    const isAdmin = user.email === 'mathofhy@naver.com';

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

        // 2. Fetch User's Purchased DBs (original_bin_id 목록)
        const { data: purchases, error: purchaseError } = await supabase
            .from('purchases')
            .select(`
                exam_materials!inner (
                    id, title, school, grade, semester, exam_type, subject, file_type, content_type
                )
            `)
            .eq('user_id', user.id);

        if (purchaseError) {
            console.error("Purchase Fetch Error:", purchaseError);
            return NextResponse.json({ success: false, error: 'Failed to fetch purchased databases' }, { status: 500 });
        }

        const dbPurchases = purchases?.filter((p: any) =>
            p.exam_materials.file_type === 'DB' ||
            p.exam_materials.content_type === '개인DB'
        ) || [];

        const purchasedDbs = dbPurchases.map((p: any) => p.exam_materials);
        // 구매한 DB의 exam_materials ID 목록 → RPC에 전달해 DB 레벨에서 필터링
        const allowedBinIds = isAdmin ? null : (purchasedDbs.length > 0 ? purchasedDbs.map((db: any) => db.id) : null);

        if (!isAdmin && purchasedDbs.length === 0) {
            return NextResponse.json({ success: false, error: '구매한 DB가 없습니다.', data: [] });
        }

        // 3. Perform Vector Search via RPC (구매한 DB 범위 안에서만 검색)
        const { data: similarQuestions, error: searchError } = await supabase
            .rpc('match_questions', {
                query_embedding: source.embedding,
                match_threshold: 1 - threshold,
                match_count: limit * 5, // 여유있게 limit의 5배만 가져오면 충분
                filter_exclude_id: id,
                target_unit: source.unit,
                allowed_bin_ids: allowedBinIds // ★ DB 레벨 필터링
            });

        if (searchError) throw searchError;

        // 4. Filter results based on purchased DB metadata
        const metadataFilter = (q: any) => {
            return purchasedDbs.some((db: any) => {
                // School Check (Flexible match exactly like the new sync logic)
                const qName = (q.school || '').replace(/고등학교|고/g, '');
                const dbName = (db.school || '').replace(/고등학교|고/g, '');
                if (qName !== dbName) return false;

                // Grade Mapping & Check
                let dbGrade = String(db.grade);
                if (dbGrade && !dbGrade.startsWith('고') && ['1', '2', '3'].includes(dbGrade)) {
                    dbGrade = `고${dbGrade}`;
                }
                if (q.grade && q.grade !== dbGrade) return false;

                // Year Mapping & Check
                let dbYear = String(db.exam_year || db.year || '');
                if (!dbYear && db.title) {
                    const match = db.title.match(/20[0-9]{2}/);
                    if (match) dbYear = match[0];
                }
                if (dbYear && q.year && String(q.year) !== dbYear) return false;

                // Semester/ExamType Mapping
                if (db.semester && db.exam_type) {
                    const semNum = String(db.semester).replace(/[^0-9]/g, '');
                    const typeShort = db.exam_type.includes('중간') ? '중간' : (db.exam_type.includes('기말') ? '기말' : '');
                    if (semNum && typeShort) {
                        const expectedSem = `${semNum}학기${typeShort}`;
                        if (q.semester && q.semester !== expectedSem) return false;
                    }
                }

                // Subject Check
                if (db.subject && q.subject !== db.subject) return false;

                return true;
            });
        };

        let results = similarQuestions || [];

        // DB 레벨에서 이미 구매 필터가 적용됐으므로 JS 후처리 불필요
        // (admin은 allowed_bin_ids=null로 전체 검색)

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
