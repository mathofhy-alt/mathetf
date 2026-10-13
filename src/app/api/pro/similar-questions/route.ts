
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { isPersonalDbFree } from '@/lib/config';

/**
 * GET /api/pro/similar-questions?id={questionId}&limit={limit}&basis={statement|solution}
 *
 * 유사도 기준이 둘이다.
 *  - solution(기본, 기존 동작): questions.embedding — content_xml 전체를 임베딩한 값인데
 *    HML 파서가 미주(해설)를 문항에 함께 담아 실측 약 75%가 해설이다. 사실상 '풀이 유사'.
 *  - statement: questions.embedding_statement — 해설(ENDNOTE)을 뺀 발문만의 임베딩. '문제 유사'.
 *
 * ⚠ statement 를 골랐는데 원본에 발문 임베딩이 아직 없으면(백필 미완) solution 으로 폴백하고
 *   응답에 basis 를 실어 알려준다. 화면이 빈 채로 남는 것보다 낫다.
 */
export async function GET(req: NextRequest) {
    const supabase = createClient();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const limit = parseInt(searchParams.get('limit') || '5');
    const threshold = parseFloat(searchParams.get('threshold') || '0.5');
    const basisParam = searchParams.get('basis') === 'statement' ? 'statement' : 'solution';

    if (!id) {
        return NextResponse.json({ success: false, error: 'Missing question ID' }, { status: 400 });
    }

    try {
        // [성능 2026-10-01] 미리 계산한 유사문항(question_similar)을 먼저 본다.
        // 실측: 누를 때마다 하던 벡터 검색이 0.5~3.7초 → 표 조회 2번(~0.1초).
        // 표에 없는 문항(방금 등록된 문항, 표가 아직 없는 환경)은 아래 예전 벡터 검색으로 간다.
        //
        // [10/13 유사문항 품질] 50문항×상위5 를 강사 기준으로 채점(쓸 만한가 O/△): 발문 유사도 순서 56% → 아래 합산 점수 65%.
        //   ① 두 기준(발문·풀이) 목록을 합치고  점수 = 발문유사 + 풀이유사 − 0.02×난이도차 + 0.03×개념태그 겹침
        //      (발문·풀이 유사도만으론 '같은 단원 다른 풀이'를 못 가르고, 태그·난이도가 그걸 조금 가른다 — 459쌍 실측)
        //   ② 똑같은 문제(가형·나형 중복 출제, 학교가 평가원 문제를 그대로 낸 것)는 뺀다 — 본문+수식이 같으면 같은 문제
        //   ③ 변형 회차 짝([id, 1, 'variant'], scripts/inject_variant_pairs.py)은 단원·임계값과 상관없이 맨 위
        //   basis=solution 을 고르면 예전처럼 풀이 유사도 순서만 쓴다(화면의 '풀이 유사' 토글).
        const admin = createAdminClient();
        const [authRes, preRes] = await Promise.all([
            supabase.auth.getUser(),
            admin.from('question_similar').select('basis, neighbors').eq('question_id', id).in('basis', ['statement', 'solution']),
        ]);
        const user = authRes.data?.user;
        if (authRes.error || !user) {
            return NextResponse.json({success:false,error:'로그인 후 유사 문항을 찾아볼 수 있습니다.'},{status:401});
        }
        const isAdmin = user.email === 'mathofhy@naver.com';
        let precomputed: any[] | null = null;
        type Nb = [string, number] | [string, number, string];
        const lists: Record<string, Nb[]> = {};
        for (const r of (preRes.data || []) as any[]) lists[r.basis] = Array.isArray(r.neighbors) ? r.neighbors : [];
        const stmt = lists.statement || [], sol = lists.solution || [];
        const combined = basisParam === 'statement' && stmt.length > 0;
        const main: Nb[] = combined ? stmt : (lists[basisParam] || []);
        if (!preRes.error && (main.length > 0 || (combined && sol.length > 0))) {
            const variantIds = new Set<string>([...stmt, ...sol].filter(p => p[2] === 'variant').map(p => p[0]));
            const simS = new Map(stmt.map(([q, s]) => [q, Number(s)])), simO = new Map(sol.map(([q, s]) => [q, Number(s)]));
            const candIds = Array.from(new Set((combined ? [...stmt, ...sol] : main).map(p => p[0])));
            const SEL = 'id, school, grade, year, semester, subject, unit, question_number, key_concepts, difficulty, source_db_id, question_type, is_off_curriculum, plain_text, equation_scripts';
            const [{ data: srcRow }, { data: rows, error: rowsError }] = await Promise.all([
                admin.from('questions').select('unit, difficulty, key_concepts, plain_text, equation_scripts').eq('id', id).maybeSingle(),
                candIds.length ? admin.from('questions').select(SEL).in('id', candIds).eq('work_status', 'sorted')
                    : Promise.resolve({ data: [] as any[], error: null }),
            ]);
            if (srcRow && !rowsError) {
                const sig = (r: any) => `${String(r.plain_text || '').replace(/\s|[①②③④⑤]/g, '')}|${(Array.isArray(r.equation_scripts) ? r.equation_scripts.join(' ') : String(r.equation_scripts || '')).replace(/\s/g, '')}`;
                const tagsOf = (r: any): Set<string> => {
                    const t = r.key_concepts; let arr: string[] = [];
                    if (Array.isArray(t)) arr = t.map(String);
                    else if (typeof t === 'string') arr = t.match(/#[^'",\]]+/g) || [];
                    return new Set(arr.map(x => x.trim()));
                };
                const srcSig = sig(srcRow), srcTags = tagsOf(srcRow), srcDiff = Number(srcRow.difficulty) || 5;
                const floorS = stmt.length ? Math.min(...stmt.map(p => Number(p[1]))) - 0.01 : 0.85;
                const floorO = sol.length ? Math.min(...sol.map(p => Number(p[1]))) - 0.01 : 0.85;
                const byId = new Map((rows || []).map((r: any) => [r.id, r]));
                const scored: any[] = [];
                for (const qid of candIds) {
                    const r = byId.get(qid); if (!r) continue;
                    const isVariant = variantIds.has(qid);
                    if (!isVariant && srcRow.unit && r.unit !== srcRow.unit) continue;
                    const ss = simS.get(qid) ?? floorS, so = simO.get(qid) ?? floorO;
                    const shown = combined ? Math.max(ss, so) : (simS.get(qid) ?? so);
                    if (!isVariant && shown <= 1 - threshold) continue;
                    if (!isVariant && srcSig.length > 1 && sig(r) === srcSig) continue;   // ② 같은 문제
                    let tagHit = 0; for (const t of tagsOf(r)) if (srcTags.has(t)) tagHit++;
                    const score = isVariant ? 9 : combined
                        ? ss + so - 0.02 * Math.abs((Number(r.difficulty) || 5) - srcDiff) + 0.03 * tagHit
                        : shown;
                    scored.push({ r, score, shown, isVariant });
                }
                scored.sort((a, b) => b.score - a.score);
                const seen = new Set<string>(); precomputed = [];
                for (const x of scored) {
                    const k = sig(x.r); if (k.length > 1 && seen.has(k)) continue; seen.add(k);   // ② 후보끼리 같은 문제
                    const { plain_text, equation_scripts, ...pub } = x.r;   // 발문 텍스트는 응답에 싣지 않는다(스크래핑 우려)
                    precomputed.push({ ...pub, similarity: x.shown, ...(x.isVariant ? { relation: 'variant' } : {}) });
                }
                // 계산 뒤 단원이 바뀌는 등으로 저장된 목록이 전부 걸러졌으면 실시간 검색으로 넘긴다
                if (precomputed.length === 0 && candIds.length > 0) precomputed = null;
            }
        }

        // 예전 경로에서만 원본 임베딩을 읽는다(벡터 2개 ≈ 40KB 라 미리계산 경로에선 안 읽는다)
        const source = precomputed ? null : (await admin.from('questions').select('embedding, embedding_statement, unit').eq('id', id).single()).data;   // [10/8] 회원 권한 문항 읽기 봉쇄 — 서버 권한(임베딩은 응답에 안 나감)
        if (!precomputed && !source) {
            return NextResponse.json({ success: false, error: '원본 문항을 찾을 수 없습니다. 다른 문항을 선택해주세요.' }, { status: 404 });
        }

        // 발문 임베딩이 아직 없는 문항은 기존 기준으로 되돌린다(백필 진행 중에도 화면이 살아 있게).
        const basis: 'statement' | 'solution' = precomputed ? basisParam :
            basisParam === 'statement' && source!.embedding_statement ? 'statement' : 'solution';
        const queryEmbedding = precomputed ? null : basis === 'statement' ? source!.embedding_statement : source!.embedding;

        if (!precomputed && !queryEmbedding) {
            return NextResponse.json({
                success: false,
                error: process.env.NEXT_PUBLIC_LOCAL_PREVIEW === '1' ? '검토 화면에는 유사문항 추천 결과가 포함되지 않았습니다. 실제 기출 선택·저장·같은 범위 재출제를 이용할 수 있습니다.' : '이 문항의 유사문항 검색 자료가 아직 준비되지 않았습니다. 다른 문항을 선택하거나 같은 범위로 자동 출제해주세요.'
            }, { status: 400 });
        }

        // 2. 구매 DB 목록 — metadataFilter(유료모드 전용)에만 쓰임.
        // [성능] 무료모드/어드민은 필터를 안 거치므로 조회 자체를 생략 (왕복 1회 절약).
        let purchasedDbs: any[] = [];

        if (!isAdmin && !isPersonalDbFree()) {
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
                return NextResponse.json({ success: false, error: '이용 가능한 출제 자료를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
            }

            const dbPurchases = purchases?.filter((p: any) =>
                p.exam_materials.file_type === 'DB' ||
                p.exam_materials.content_type === '개인DB'
            ) || [];
            purchasedDbs = dbPurchases.map((p: any) => p.exam_materials);
        }

        // 구매한 DB의 exam_materials ID 목록 → RPC에 전달해 DB 레벨에서 필터링
        // 무료 모드/어드민은 null (전체 허용), 유료 모드는 구매한 DB ID 목록
        const allowedBinIds = (isAdmin || isPersonalDbFree())
            ? null
            : (purchasedDbs.length > 0 ? purchasedDbs.map((db: any) => db.id) : null);

        if (!isAdmin && !isPersonalDbFree() && purchasedDbs.length === 0) {
            return NextResponse.json({ success: false, error: '구매한 DB가 없습니다.', data: [] });
        }

        // 3. Perform Vector Search via RPC (구매한 DB 범위 안에서만 검색) — 미리계산이 없을 때만
        let similarQuestions: any[] | null = precomputed;
        if (!precomputed) {
            const { data, error: searchError } = await admin   // [10/8] 두 RPC 모두 sorted 만 돌려준다
                .rpc(basis === 'statement' ? 'match_questions_statement' : 'match_questions', {
                    query_embedding: queryEmbedding,
                    match_threshold: 1 - threshold,
                    match_count: limit * 5, // 여유있게 limit의 5배만 가져오면 충분
                    filter_exclude_id: id,
                    target_unit: source!.unit,
                    allowed_bin_ids: allowedBinIds // ★ DB 레벨 필터링
                });
            if (searchError) throw searchError;
            similarQuestions = data;
        }

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
        if (!isAdmin && !isPersonalDbFree()) {
            results = results.filter(metadataFilter);
        }

        // Filter by Unit (Strict matching as requested previously) — 미리계산 경로는 위에서 이미 걸렀다
        if (source?.unit) {
            results = results.filter((q: any) => q.unit === source.unit);
        }

        results = results.slice(0, limit);

        // [성능] meta=1 이면 이미지를 싣지 않고 즉시 반환 (모달이 카드 먼저 띄우고
        // 이미지는 /api/questions/images 로 따로 받음 → 스피너 시간 단축)
        const metaOnly = searchParams.get('meta') === '1';
        if (metaOnly) {
            results = results.map((q: any) => ({ ...q, question_images: null }));
            return NextResponse.json({ success: true, data: results, basis });
        }

        // 5. RPC 결과를 그대로 사용, question_images만 별도 조회 후 merge
        //    (기존: questions 전체 재조회 + question_images JOIN → DB 왕복 2회)
        //    (개선: question_images만 조회 → DB 왕복 1회 감소, 전송 데이터 대폭 감소)
        if (results.length > 0) {
            const resultIds = results.map((r: any) => r.id);
            const similarityMap = Object.fromEntries(
                results.map((r: any) => [r.id, r.similarity])
            );

            // images만 조회 (questions 전체 재조회 불필요)
            const { data: images } = await admin   // [10/8] 결과는 sorted 문항뿐 — 서버 권한으로 그림 조회
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
            data: results,
            basis
        });

    } catch (e: any) {
        console.error("Similarity Search Error:", e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
