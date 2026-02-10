import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return new NextResponse('Unauthorized', { status: 401 });

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
        const { ids, questions: rawQuestions, title, folderId } = body;

        let questions: any[] = rawQuestions || [];
        let finalImagesByQuestion = new Map<string, any[]>();

        // 1. Fetch full data if IDs are provided
        if (ids && ids.length > 0) {
            console.log(`[SaveAPI] Fetching data for ${ids.length} IDs from DB...`);

            const { data: qData, error: qError } = await supabase
                .from('questions')
                .select('*')
                .in('id', ids);

            if (qError) throw new Error("DB Questions Fetch Error: " + qError.message);

            const { data: imgData, error: imgError } = await supabase
                .from('question_images')
                .select('*')
                .in('question_id', ids);

            if (imgError) console.warn('[SaveAPI] Image fetch warning:', imgError.message);

            // [BATCH OPTIMIZATION V3] Delegate Resizing to VPS
            if (imgData && imgData.length > 0) {
                console.log(`[SaveAPI] Resolving/Resizing ${imgData.length} images...`);

                const resizeTasks: { input: Buffer, img: any }[] = [];

                await Promise.all(imgData.map(async (img) => {
                    let buffer: Buffer | null = null;

                    // Resolve URL to Buffer
                    if (img.data && (img.data.startsWith('http://') || img.data.startsWith('https://'))) {
                        try {
                            const res = await fetch(img.data);
                            if (res.ok) buffer = Buffer.from(await res.arrayBuffer());
                        } catch (e) { console.warn(`[SaveAPI] URL Fetch Fail: ${img.data}`, e); }
                    } else if (img.data && typeof img.data === 'string') {
                        try {
                            buffer = Buffer.from(img.data, 'base64');
                            // Decompress if needed
                            const headHex = buffer.subarray(0, 2).toString('hex');
                            if (headHex !== '8950' && headHex !== 'ffd8' && buffer.subarray(0, 2).toString('ascii') !== 'BM') {
                                try { buffer = zlib.inflateRawSync(buffer); } catch (e) {
                                    try { buffer = zlib.inflateSync(buffer); } catch (e2) { }
                                }
                            }
                        } catch (e) { }
                    }

                    if (!buffer) return;

                    // Filter for resizing (>50KB)
                    if (buffer.length > 50 * 1024) {
                        resizeTasks.push({ input: buffer, img });
                    } else {
                        img.data = buffer.toString('base64');
                        img.size_bytes = buffer.length;
                    }
                }));

                if (resizeTasks.length > 0) {
                    console.log(`[SaveAPI] Sending ${resizeTasks.length} images to VPS for batch resize...`);
                    try {
                        const vpsUrl = process.env.NEXT_PUBLIC_MATH_PROXY_URL || 'http://127.0.0.1:5001';
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
                const qMap = new Map(qData.map(q => [q.id, q]));
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
                q.content_xml = q.fragment_xml || `<P ParaShape="0" Style="0"><TEXT CharShape="0">[Error] Content Missing</TEXT></P>`;
            }
            q.question_number = idx + 1;
        });

        // 3. Load Template
        let templatePath = path.join(process.cwd(), '재조립양식.hml');
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

        const titleStr = title || 'Exam_Paper';
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');

        const result = await generateHmlFromTemplate(templateXml, questionsWithImages, {
            title: titleStr,
            date: dateStr
        });

        if (!result) throw new Error("Generator failed");

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

        // 6. Metadata Sidecar
        const totalDifficulty = questions.reduce((sum: number, q: any) => sum + (Number(q.difficulty) || 0), 0);
        const avgDifficulty = Number((totalDifficulty / questions.length).toFixed(2));

        const metaData = {
            source_db_ids: Array.from(new Set(questions.map((q: any) => q.source_db_id).filter(Boolean))),
            question_ids: questions.map((q: any) => q.id), // [V73] For re-editing
            question_count: questions.length,
            average_difficulty: avgDifficulty,
            title: titleStr,
            created_at: new Date().toISOString()
        };

        await supabase.storage
            .from('exams')
            .upload(`${user.id}/${fileId}.json`, JSON.stringify(metaData), {
                contentType: 'application/json',
                upsert: false
            });

        // 7. DB Item
        const { data: itemData, error: itemError } = await supabase
            .from('user_items')
            .insert({
                user_id: user.id,
                folder_id: folderId === 'root' ? null : folderId,
                type: 'saved_exam',
                name: titleStr,
                reference_id: fileId,
                details: metaData
            })
            .select()
            .single();

        if (itemError) throw new Error(`Item creation failed: ${itemError.message}`);

        console.log('[SaveAPI] Success!');
        return NextResponse.json({ success: true, item: itemData });

    } catch (e: any) {
        console.error('[SaveAPI] Fatal Error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
