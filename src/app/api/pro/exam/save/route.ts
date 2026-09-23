import {parseDraft} from '@/lib/questions/draft';
import {createAdminClient} from '@/utils/supabase/server-admin';
import {availableCatalog} from '@/lib/questions/catalog';
import {resolveScope} from '@/lib/questions/scope';
import {uuidPattern} from '@/lib/payments/order';
import {productionSite} from '@/lib/analytics/server';
import {validateHml,validateQuestionXml} from '@/lib/hml-v2/validate';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({success:false,error:'로그인이 필요합니다.'},{status:401});
    const admin = createAdminClient();

    // 저장 도중 실패하면 되돌릴 수 있도록, 업로드한 스토리지 경로를 추적한다. (고아 파일 방지)
    const uploadedPaths: string[] = [];

    try {
        // [V73] Limit: Max 20 exams per user
        const { count, error: countError } = await supabase
            .from('user_items')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('type', 'saved_exam');

        if (countError) throw new Error("Count check failed");
        if (count !== null && count >= 20) {
            return NextResponse.json({
                success: false,
                error: '시험지는 최대 20개까지만 생성할 수 있습니다. 기존 시험지를 삭제한 후 다시 시도해주세요.'
            }, { status: 403 });
        }

        console.log('[SaveAPI] Request received');
        const body = await req.json();
        const { ids, questions: rawQuestions, title, folderId, dbIds, questionsPerColumn } = body;
        if (!Array.isArray(ids) || ids.length<1 || ids.length>50 || ids.some((id:unknown)=>typeof id!=='string'||!uuidPattern.test(id)) || new Set(ids).size!==ids.length) return NextResponse.json({success:false,error:'서로 다른 문항을 1~50개 선택해주세요.'},{status:400});
        if (typeof title!=='string' || !title.trim() || title.length>100 || ![1,2,3].includes(questionsPerColumn)) return NextResponse.json({success:false,error:'제목은 100자 이내, 열당 문항 수는 1~3개로 설정해주세요.'},{status:400});
        if (folderId && folderId!=='root') {
            if (!uuidPattern.test(folderId)) throw new Error('저장 폴더를 확인해주세요.');
            const {data:folder,error:folderError}=await supabase.from('folders').select('id').eq('id',folderId).eq('user_id',user.id).single();
            if(folderError || !folder) throw new Error('저장 폴더를 찾을 수 없습니다.');
        }
        const catalog = await availableCatalog();
        const allowedDbIds=new Set(catalog.filter(d=>!d.availability).map(d=>d.id));
        const savedDbIds=Array.isArray(dbIds)?Array.from(new Set(dbIds.filter((id:unknown)=>typeof id==='string'&&allowedDbIds.has(id)))):[];
        const scope = resolveScope(catalog, catalog.filter(db=>!db.availability).map(db=>db.id));


        // [V74] Limit: Max 50 questions per exam
        const MAX_QUESTIONS_PER_EXAM = 50;
        const questionCount = ids?.length ?? rawQuestions?.length ?? 0;
        if (questionCount > MAX_QUESTIONS_PER_EXAM) {
            return NextResponse.json({
                success: false,
                error: `한 시험지에 최대 ${MAX_QUESTIONS_PER_EXAM}문제까지만 담을 수 있습니다. (요청: ${questionCount}개)`
            }, { status: 400 });
        }

        // 이름이 겹치면 막지 않고 뒤에 번호를 붙인다.
        // [2026-08-31] 예전엔 409 로 거절했다. 그런데 8/31 에 한 사용자가 17:27 에 저장에 성공하고
        // 17:28 에 같은 이름으로 두 번째 시험지를 만들려다 막혔다. 담기까지 다 해놓고 마지막에
        // 튕기는 건 퍼널에서 가장 아까운 이탈이다(그날 저장 실패 2건 중 1건이 이것).
        // 이름은 사용자가 나중에 보관함에서 바꿀 수 있으니, 여기서 막을 이유가 없다.
        let finalTitle = title;
        if (title) {
            const { data: sameName } = await supabase
                .from('user_items')
                .select('name')
                .eq('user_id', user.id)
                .eq('type', 'saved_exam')
                .like('name', `${title}%`);

            const taken = new Set((sameName || []).map((x: { name: string }) => x.name));
            if (taken.has(title)) {
                let n = 2;
                while (taken.has(`${title} (${n})`) && n < 1000) n++;
                finalTitle = `${title} (${n})`;
            }
        }

        let questions: any[] = rawQuestions || [];
        let finalImagesByQuestion = new Map<string, any[]>();

        // 1. Fetch full data if IDs are provided
        if (ids && ids.length > 0) {
            console.log(`[SaveAPI] Fetching data for ${ids.length} IDs from DB...`);

            const { data: qData, error: qError } = await admin
                .rpc('question_bank_candidates', {p_scope:scope})
                .select('*')
                .in('id', ids).returns<any[]>();

            if (qError) throw new Error("문항 원본을 불러오지 못했습니다.");
            if(!Array.isArray(qData) || qData.length!==ids.length) throw new Error("선택한 문항 중 이용할 수 없는 문항이 있습니다. 목록을 확인해주세요.");

            const { data: imgData, error: imgError } = await admin
                .from('question_images')
                .select('*')
                .in('question_id', ids);

            if (imgError) throw new Error('문항 그림을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');

            // [BATCH OPTIMIZATION V3] Delegate Resizing to VPS
            if (imgData && imgData.length > 0) {
                console.log(`[SaveAPI] Resolving/Resizing ${imgData.length} images...`);

                const resizeTasks: { input: Buffer, img: any }[] = [];

                await Promise.all(imgData.map(async (img) => {
                    let buffer: Buffer | null = null;

                    // Resolve URL to Buffer
                    if (img.data && (img.data.startsWith('http://') || img.data.startsWith('https://'))) {
                        try {
                            const res = await fetch(img.data,{signal:AbortSignal.timeout(10000)});
                            if (res.ok) buffer = Buffer.from(await res.arrayBuffer());
                        } catch (e) { console.warn(`[SaveAPI] URL Fetch Fail: ${img.data}`, e); }
                    } else if (img.data && typeof img.data === 'string') {
                        try {
                            buffer = Buffer.from(img.data.replace(/^data:[^,]*,/, ''), 'base64');
                            // Decompress if needed (but skip known image formats: PNG, JPEG, BMP, WebP/RIFF)
                            const headHex = buffer.subarray(0, 2).toString('hex');
                            if (headHex !== '8950' && headHex !== 'ffd8' && headHex !== '5249' && buffer.subarray(0, 2).toString('ascii') !== 'BM') {
                                try { buffer = zlib.inflateRawSync(buffer); } catch (e) {
                                    try { buffer = zlib.inflateSync(buffer); } catch (e2) { }
                                }
                            }
                        } catch (e) { }
                    }

                    if (!buffer || !buffer.length) throw new Error('문항 그림 원본을 불러오지 못했습니다.');
                    img.data = buffer.toString('base64');
                    img.size_bytes = buffer.length;

                    // Filter for resizing (>50KB)
                    if (buffer.length > 50 * 1024) {
                        resizeTasks.push({ input: buffer, img });
                    } else {
                        img.data = buffer.toString('base64');
                        img.size_bytes = buffer.length;
                    }
                }));

                if (resizeTasks.length > 0 && process.env.NEXT_PUBLIC_LOCAL_PREVIEW !== '1') {
                    console.log(`[SaveAPI] Sending ${resizeTasks.length} images to VPS for batch resize...`);
                    try {
                        const vpsUrl = process.env.MATH_PROXY_URL || process.env.NEXT_PUBLIC_MATH_PROXY_URL || 'http://127.0.0.1:5001';
                        const response = await fetch(`${vpsUrl}/batch-resize`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                images: resizeTasks.map(t => t.input.toString('base64')),
                                max_width: 1000,
                                quality: 80
                            }),
                            signal: AbortSignal.timeout(60000) // 1 min timeout
                        });

                        if (response.ok) {
                            const result = await response.json();
                            if (result.success) {
                                console.log(`[SaveAPI] VPS Batch Resize Success (${result.elapsed_ms}ms)`);
                                for (let i = 0; i < resizeTasks.length; i++) {
                                    const task = resizeTasks[i];
                                    const resData = result.results[i];
                                    if (resData && resData.success) {
                                        task.img.data = resData.data;
                                        task.img.size_bytes = resData.size;
                                        task.img.format = 'jpg';
                                    } else {
                                        task.img.data = task.input.toString('base64');
                                        task.img.size_bytes = task.input.length;
                                    }
                                }
                            }
                        }
                    } catch (err: any) {
                        console.error(`[SaveAPI] VPS Resize Failed, using originals:`, err.message);
                        resizeTasks.forEach(t => {
                            t.img.data = t.input.toString('base64');
                            t.img.size_bytes = t.input.length;
                        });
                    }
                }

                // Group images
                imgData.forEach(img => {
                    const qid = img.question_id;
                    if (!finalImagesByQuestion.has(qid)) finalImagesByQuestion.set(qid, []);
                    finalImagesByQuestion.get(qid)!.push(img);
                });
            }

            // Restore ordered questions
            if (qData) {
                const qMap = new Map<string,any>(qData.map((q:any) => [q.id, q]));
                questions = ids.map((id: string) => {
                    const q = qMap.get(id);
                    if (q) {
                        q.images = finalImagesByQuestion.get(q.id) || [];
                        return q;
                    }
                    return null;
                }).filter(Boolean);
            }
        }

        if (questions.length === 0) return NextResponse.json({ success: false, error: 'No questions provided' }, { status: 400 });

        // 2. Prepare questions for HML
        questions.forEach((q, idx) => {
            if (!q.content_xml || q.content_xml.trim().length === 0) {
                if(!q.fragment_xml?.trim()) throw new Error(`${idx+1}번 문항의 원본 내용이 없습니다.`);
                q.content_xml = q.fragment_xml;
            }
            validateQuestionXml(q.content_xml);
            q.question_number = idx + 1;
        });

        // 3. Load Template
        let templatePath = path.join(process.cwd(), '수학ETF양식.hml');
        if (!fs.existsSync(templatePath)) templatePath = path.join(process.cwd(), '재조립양식.hml');
        if (!fs.existsSync(templatePath)) templatePath = path.join(process.cwd(), 'hml v2-test-tem.hml');
        if (!fs.existsSync(templatePath)) templatePath = path.join(process.cwd(), 'template.hml');
        if (!fs.existsSync(templatePath)) throw new Error('Template file missing');

        const templateXml = fs.readFileSync(templatePath, 'utf-8');

        // 4. Generate HML
        const { generateHmlFromTemplate } = await import('@/lib/hml-v2/generator');
        const questionsWithImages = questions.map(q => ({
            question: q,
            images: q.images || []
        }));

        // finalTitle — 이름이 겹쳐 번호가 붙었을 수 있다. 파일·보관함 이름 모두 이걸 쓴다.
        const titleStr = (finalTitle || 'Exam_Paper').replace(/[\\/<>:"|\?\*]/g, '_').trim() || 'Exam_Paper';
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');

        const result = await generateHmlFromTemplate(templateXml, questionsWithImages, {
            title: titleStr,
            date: dateStr,
            questionsPerColumn: questionsPerColumn || 2,
        });

        if (!result || result.questionCount!==ids.length) throw new Error("시험지 문항 수가 일치하지 않습니다.");
        validateHml(result.hmlContent);

        // 5. Upload to Storage
        const fileId = crypto.randomUUID();
        const storageFilename = `${fileId}.hml`;
        const filePath = `${user.id}/${storageFilename}`;

        const { error: uploadError } = await supabase
            .storage
            .from('exams')
            .upload(filePath, result.hmlContent, {
                contentType: 'application/xml',
                upsert: false
            });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
        uploadedPaths.push(filePath);

        // 6. Metadata Sidecar
        const totalDifficulty = questions.reduce((sum: number, q: any) => sum + (Number(q.difficulty) || 0), 0);
        const avgDifficulty = Number((totalDifficulty / questions.length).toFixed(2));

        const metaData = {
            source_db_ids: savedDbIds.length > 0
                ? savedDbIds  // 프론트에서 전달된 exam_materials UUID 배열 사용
                : Array.from(new Set(questions.map((q: any) => q.source_db_id).filter(Boolean))),  // fallback
            question_ids: questions.map((q: any) => q.id), // [V73] For re-editing
            question_count: questions.length,
            questions_per_column:questionsPerColumn,
            filters:parseDraft(JSON.stringify({version:1,updatedAt:Date.now(),cartIds:[],selectedDbIds:[],filters:body.filters}))?.filters||null,
            file_bytes:Buffer.byteLength(result.hmlContent,'utf8'),
            average_difficulty: avgDifficulty,
            title: titleStr,
            created_at: new Date().toISOString()
        };

        const {error:sidecarError} = await supabase.storage
            .from('exams')
            .upload(`${user.id}/${fileId}.json`, JSON.stringify(metaData), {
                contentType: 'application/json',
                upsert: false
            });
        if(sidecarError) throw new Error('시험지 편집 정보를 저장하지 못했습니다.');
        uploadedPaths.push(`${user.id}/${fileId}.json`);

        // 7. DB Item
        const session = req.headers.get('x-qb-session-id') || '';
        const {data:itemData,error:itemError} = await admin.rpc('save_exam_item',{
            p_user_id:user.id,p_folder_id:folderId==='root'?null:(folderId||null),p_name:titleStr,p_reference_id:fileId,
            p_details:{...metaData,file_format:'hml',analytics_session_id:uuidPattern.test(session)?session:null},
            p_session_id:uuidPattern.test(session)?session:null,p_track:productionSite(req)&&user.email!=='mathofhy@naver.com',
        });

        if (itemError) throw new Error(`Item creation failed: ${itemError.message}`);

        console.log('[SaveAPI] Success!');
        // savedTitle — 이름이 겹쳐 번호가 붙었으면 클라이언트가 그걸 알려줄 수 있게 돌려준다.
        return NextResponse.json({ success: true, item: itemData, savedTitle: titleStr, fileBytes:Buffer.byteLength(result.hmlContent,'utf8') });

    } catch (e: any) {
        // 실패 시 이미 업로드된 .hml/.json 을 삭제해 '목록엔 없는데 파일만 남는' 고아를 방지한다.
        if (uploadedPaths.length > 0) {
            try {
                await supabase.storage.from('exams').remove(uploadedPaths);
                console.log(`[SaveAPI] Rolled back ${uploadedPaths.length} orphan file(s) after failure`);
            } catch (cleanupErr) {
                console.warn('[SaveAPI] Rollback cleanup failed:', cleanupErr);
            }
        }
        console.error('[SaveAPI] Fatal Error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
