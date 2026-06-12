
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { PERSONAL_DB_FREE_MODE } from '@/lib/config';

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
        // [FREE MODE] 무료 기간 중에는 구매 여부 무관하게 전체 개인DB 허용
        let purchasedDbs: any[] = [];

        if (isAdmin || PERSONAL_DB_FREE_MODE) {
            // 전체 개인DB를 허용 (모의고사 제외)
            const { data: allDbs, error: allDbError } = await supabase
                .from('exam_materials')
                .select('id, title, school, grade, semester, exam_type, subject, file_type, content_type')
                .eq('file_type', 'DB')
                .neq('exam_type', '모의고사');

            if (allDbError) {
                console.error("All DB Fetch Error:", allDbError);
                return NextResponse.json({ success: false, error: 'Failed to fetch databases' }, { status: 500 });
            }
            purchasedDbs = allDbs || [];
        } else {
            // [PAID MODE] 구매한 DB만 허용
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
            purchasedDbs = dbPurchases.map((p: any) => p.exam_materials);
        }

        // 구매한 DB의 exam_materials ID 목록 → RPC에 전달해 DB 레벨에서 필터링
        // 무료 모드/어드민은 null (전체 허용), 유료 모드는 구매한 DB ID 목록
        const allowedBinIds = (isAdmin || PERSONAL_DB_FREE_MODE)
            ? null
            : (purchasedDbs.length > 0 ? purchasedDbs.map((db: any) => db.id) : null);

        if (!isAdmin && !PERSONAL_DB_FREE_MODE && purchasedDbs.length === 0) {
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

        // [버그수정] 구매 필터는 JS(metadataFilter)에서 적용한다.
        // questions 테이블엔 exam_materials 와 연결되는 컬럼이 없어 DB 레벨 필터(allowed_bin_ids)가
        // 불가능했고(존재하지 않는 컬럼 참조로 유료모드에서 RPC가 터지는 잠복 버그),
        // match_questions 는 인덱스 경로로 단일화 + 필터는 여기서 수행.
        if (!isAdmin && !PERSONAL_DB_FREE_MODE) {
            results = results.filter(metadataFilter);
        }

        // Filter by Unit (Strict matching as requested previously)
        if (source.unit) {
            results = results.filter((q: any) => q.unit === source.unit);
        }

        results = results.slice(0, limit);

        // 5. RPC 결과를 그대로 사용, question_images만 별도 조회 후 merge
        //    (기존: questions 전체 재조회 + question_images JOIN → DB 왕복 2회)
        //    (개선: question_images만 조회 → DB 왕복 1회 감소, 전송 데이터 대폭 감소)
        if (results.length > 0) {
            const resultIds = results.map((r: any) => r.id);
            const similarityMap = Object.fromEntries(
                results.map((r: any) => [r.id, r.similarity])
            );

            // images만 조회 (questions 전체 재조회 불필요)
            const { data: images } = await supabase
                .from('question_images')
                .select('*')
                .in('question_id', resultIds);

            // question_id 기준으로 그룹화
            const imagesMap: Record<string, any[]> = {};
            for (const img of images || []) {
                if (!imagesMap[img.question_id]) imagesMap[img.question_id] = [];
                imagesMap[img.question_id].push(img);
            }

            // RPC 결과 순서 유지하면서 similarity + images 병합
            const rpcResults = results;
            results = resultIds
                .map((rid: string) => {
                    const q = rpcResults.find((r: any) => r.id === rid);
                    if (!q) return null;
                    return {
                        ...q,
                        question_images: imagesMap[rid] || [],
                        similarity: similarityMap[rid]
                    };
                })
                .filter(Boolean);
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
