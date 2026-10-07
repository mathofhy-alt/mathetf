import {parseDraft} from '@/lib/questions/draft';
import {stampMemberId} from '@/lib/hml-v2/member-stamp';
import {createAdminClient} from '@/utils/supabase/server-admin';
import {availableCatalog} from '@/lib/questions/catalog';
import { privateCatalog, stripPrivate } from '@/lib/questions/privateDb';
import { passStatus, recordUsage, QB_PASS } from '@/lib/qbPass';
import { QB_LIMITS } from '@/lib/qbPassConfig';
import { wholeCatalogIneligible } from '@/lib/questions/fastScope';
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

        // [10/7] 시험지 만들기 이용권 — 이용권이 없으면 한 주 무료 횟수까지만 (lib/qbPass)
        const pass = await passStatus(user).catch(() => null);
        if (!pass) return NextResponse.json({ success: false, error: '이용 현황을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 503 });
        if (!pass.unlimited && pass.freeLeft <= 0) return NextResponse.json({
            success: false, code: 'QB_PASS_REQUIRED', pass,
            error: `이번 주 무료 시험지 ${QB_PASS.freePerWeek}회를 모두 쓰셨습니다. 이용권(${QB_PASS.days}일 ${QB_PASS.salePrice.toLocaleString()}원)으로 계속 만들 수 있어요.`,
        }, { status: 402 });

        console.log('[SaveAPI] Request received');
        const body = await req.json();
        const { ids, questions: rawQuestions, title, folderId, dbIds, questionsPerColumn } = body;
        // [10/8] 이용권이 있으면(또는 운영자) 한 시험지 문항 한도를 늘린다(QB_LIMITS)
        const maxQ = (pass.passUntil || pass.unlimited) ? QB_LIMITS.pass.questions : QB_LIMITS.free.questions;
        if (!Array.isArray(ids) || ids.length<1 || ids.length>maxQ || ids.some((id:unknown)=>typeof id!=='string'||!uuidPattern.test(id)) || new Set(ids).size!==ids.length) return NextResponse.json({success:false,error:`서로 다른 문항을 1~${maxQ}개 선택해주세요.`},{status:400});
        if (typeof title!=='string' || !title.trim() || title.length>100 || ![1,2,3].includes(questionsPerColumn)) return NextResponse.json({success:false,error:'제목은 100자 이내, 열당 문항 수는 1~3개로 설정해주세요.'},{status:400});
        if (folderId && folderId!=='root') {
            if (!uuidPattern.test(folderId)) throw new Error('저장 폴더를 확인해주세요.');
            const {data:folder,error:folderError}=await supabase.from('folders').select('id').eq('id',folderId).eq('user_id',user.id).single();
            if(folderError || !folder) throw new Error('저장 폴더를 찾을 수 없습니다.');
        }
        const catalog = [...await availableCatalog(), ...await privateCatalog()];   // 전용 개인DB 문항도 저장 가능(10/6)
        const allowedDbIds=new Set(catalog.filter(d=>!d.availability).map(d=>d.id));
        const savedDbIds=Array.isArray(dbIds)?Array.from(new Set(dbIds.filter((id:unknown)=>typeof id==='string'&&allowedDbIds.has(id)))):[];
        const scope = resolveScope(catalog, catalog.filter(db=>!db.availability).map(db=>db.id));


        // [V74] Limit: Max 50 questions per exam
        const MAX_QUESTIONS_PER_EXAM = maxQ;
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

            // [10/6] 저장 실패 36%(10/6 하루 23/64) 대응. 예전엔 고른 문항 수십 개를 확인하려고 전체 자료 2,212개 규칙으로
            //   범위를 통째로 계산(question_bank_candidates)한 뒤 거기서 찾았다 → DB 가 바쁘면 제한시간 초과로
            //   '문항 원본을 불러오지 못했습니다'. 이제 문항만 직접 읽고, 검색과 같은 '범위 밖 문항 목록'(30분 캐시)으로 거른다.
            //   결과 집합은 같다: sorted 이면서 범위 밖이 아닌 문항 + 이 회원이 쓸 수 있는 전용 개인DB 문항.
            //   범위 밖 목록 함수가 없으면(null) 예전 길로 간다.
            const ineligible = await wholeCatalogIneligible(catalog);
            let qData: any[] | null = null, qError: any = null;
            if (ineligible) {
                const out = new Set(ineligible);
                const res = await admin.from('questions').select('*').in('id', ids);
                qError = res.error;
                if (!qError) {
                    const rows = (res.data || []) as any[];
                    const okPrivate = new Set((await stripPrivate(rows.filter(r => r.work_status === 'private'))).map(r => r.id));
                    qData = rows.filter(r => (r.work_status === 'sorted' && !out.has(r.id)) || okPrivate.has(r.id));
                }
            } else {
                const res = await admin.rpc('question_bank_candidates', {p_scope:scope}).select('*').in('id', ids).returns<any[]>();
                qData = res.data as any[] | null; qError = res.error;
            }

            if (qError) { console.error('[SaveAPI] question fetch error', qError.code, qError.message); throw new Error("문항 원본을 불러오지 못했습니다."); }
            if(!Array.isArray(qData) || qData.length!==ids.length) throw new Error("선택한 문항 중 이용할 수 없는 문항이 있습니다. 목록을 확인해주세요.");

            const { data: imgRows, error: imgError } = await admin
                .from('question_images')
                .select('*')
                .in('question_id', ids);

            if (imgError) throw new Error('문항 그림을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');

            // [10/6] 저장 실패('문항 그림 원본을 불러오지 못했습니다') 대응.
            //   예전엔 캡쳐(MANUAL_/AUTO_)까지 문항당 2장을 저장소 주소에서 한꺼번에(24문항 → 48장) 받았고, 한 장이라도
            //   10초를 넘기면 저장 전체가 실패했다. 그런데 HML 본문은 원본 그림(original_bin_id)만 참조한다.
            //   · 해설 캡쳐(_S_)는 어디에도 안 쓰인다 → 받지 않는다
            //   · 문제 캡쳐(_Q_)는 실측 줄 수(layout_lines)가 없는 문항의 줄 높이 추정에만 쓰인다 → 그 문항 것만
            //   · 캡쳐를 끝내 못 받으면 저장을 막지 않고 기본 줄 수로 간다(generator 폴백). 원본 그림 실패는 그대로 실패.
            const measured = new Set((qData || []).filter((q: any) => typeof q.layout_lines === 'number' && q.layout_lines > 0).map((q: any) => q.id));
            const isCapture = (img: any) => /^(MANUAL|AUTO)_/.test(img.original_bin_id || '');
            const imgData = (imgRows || []).filter((img: any) => {
                const b = img.original_bin_id || '';
                if (/^(MANUAL|AUTO)_S_/.test(b)) return false;
                if (/^(MANUAL|AUTO)_Q_/.test(b)) return !measured.has(img.question_id);
                return true;
            });
            const fetchImage = async (url: string): Promise<Buffer | null> => {
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        const res = await fetch(url, { signal: AbortSignal.timeout(attempt ? 20000 : 10000) });
                        if (res.ok) return Buffer.from(await res.arrayBuffer());
                    } catch (e) { console.warn(`[SaveAPI] URL Fetch Fail (${attempt + 1}/2): ${url}`, e); }
                }
                return null;
            };
            // 동시에 6장까지만 받는다 — 수십 장을 한꺼번에 요청하면 저장소 응답이 늦어져 시간 초과가 난다
            const runLimited = async <T,>(items: T[], limit: number, work: (item: T) => Promise<void>) => {
                let next = 0;
                await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
                    while (next < items.length) await work(items[next++]);
                }));
            };
            const droppedCaptures = new Set<any>();

            // [BATCH OPTIMIZATION V3] Delegate Resizing to VPS
            if (imgData && imgData.length > 0) {
                console.log(`[SaveAPI] Resolving/Resizing ${imgData.length} images...`);

                const resizeTasks: { input: Buffer, img: any }[] = [];

                await runLimited(imgData, 6, async (img: any) => {
                    let buffer: Buffer | null = null;

                    // Resolve URL to Buffer
                    if (img.data && (img.data.startsWith('http://') || img.data.startsWith('https://'))) {
                        buffer = await fetchImage(img.data);
                        if (!buffer && isCapture(img)) { droppedCaptures.add(img); return; }   // 줄 높이 추정용 캡쳐 — 없으면 기본값
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
                });

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
                imgData.forEach((img: any) => {
                    if (droppedCaptures.has(img)) return;   // 끝내 못 받은 줄 높이용 캡쳐
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
        result.hmlContent = stampMemberId(result.hmlContent, user.email);

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
        await recordUsage(user.id, (itemData as any)?.id ?? null);

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
