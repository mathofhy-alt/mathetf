import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/utils/admin-auth';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    const supabase = createClient();

    try {
        const body = await req.json();
        const ids: string[] = body.ids || [];

        if (ids.length === 0) return new NextResponse('No question IDs provided', { status: 400 });

        console.log(`[HML-V3-DOWNLOAD] Generating HML for ${ids.length} questions`);

        // 1. Fetch questions
        const { data: questions, error: qError } = await supabase
            .from('questions')
            .select('*')
            .in('id', ids);

        if (qError) throw new Error('Failed to fetch questions: ' + qError.message);
        if (!questions || questions.length === 0) return new NextResponse('No questions found', { status: 404 });

        // 2. Fetch images
        const { data: imgData, error: imgError } = await supabase
            .from('question_images')
            .in('question_id', ids);

        if (imgError) console.warn('[HML-V3-DOWNLOAD] Image fetch warning:', imgError.message);

        let finalImagesByQuestion = new Map<string, any[]>();

        // [BATCH OPTIMIZATION V3] Resolve and Resize (VPS Delegation)
        if (imgData && imgData.length > 0) {
            console.log(`[HML-V3-DOWNLOAD] Resolving ${imgData.length} images...`);

            const resizeTasks: { input: Buffer, img: any }[] = [];

            await Promise.all(imgData.map(async (img) => {
                let buffer: Buffer | null = null;

                // Resolve URL or Base64 to Buffer
                if (img.data && (typeof img.data === 'string') && (img.data.trim().startsWith('http://') || img.data.trim().startsWith('https://'))) {
                    try {
                        const url = img.data.trim();
                        const publicMarker = '/public/';
                        const splitIdx = url.indexOf(publicMarker);

                        if (splitIdx !== -1) {
                            const fullPath = url.substring(splitIdx + publicMarker.length);
                            const slashIdx = fullPath.indexOf('/');
                            if (slashIdx !== -1) {
                                const bucket = fullPath.substring(0, slashIdx);
                                const filePath = fullPath.substring(slashIdx + 1);
                                const { data: blob } = await supabase.storage.from(bucket).download(filePath);
                                if (blob) buffer = Buffer.from(await blob.arrayBuffer());
                            }
                        } else {
                            const res = await fetch(url);
                            if (res.ok) buffer = Buffer.from(await res.arrayBuffer());
                        }
                    } catch (e) { console.warn(`[HML-V3] URL Fetch Fail: ${img.original_bin_id}`, e); }
                } else if (img.data && typeof img.data === 'string') {
                    try {
                        buffer = Buffer.from(img.data, 'base64');
                        const headHex = buffer.subarray(0, 2).toString('hex');
                        if (headHex !== '8950' && headHex !== 'ffd8' && buffer.subarray(0, 2).toString('ascii') !== 'BM') {
                            try { buffer = zlib.inflateRawSync(buffer); } catch (e) {
                                try { buffer = zlib.inflateSync(buffer); } catch (e2) { }
                            }
                        }
                    } catch (e) { }
                }

                if (!buffer) return;

                if (buffer.length > 50 * 1024) {
                    resizeTasks.push({ input: buffer, img });
                } else {
                    img.data = buffer.toString('base64');
                    img.size_bytes = buffer.length;
                    (img as any).image_size = buffer.length;
                }
            }));

            if (resizeTasks.length > 0) {
                console.log(`[HML-V3-DOWNLOAD] Requesting VPS Batch Resize for ${resizeTasks.length} images...`);
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
                        signal: AbortSignal.timeout(60000)
                    });

                    if (response.ok) {
                        const result = await response.json();
                        if (result.success) {
                            console.log(`[HML-V3-DOWNLOAD] VPS Batch Resize Success (${result.elapsed_ms}ms)`);
                            for (let i = 0; i < resizeTasks.length; i++) {
                                const task = resizeTasks[i];
                                const resData = result.results[i];
                                if (resData && resData.success) {
                                    task.img.data = resData.data;
                                    task.img.size_bytes = resData.size;
                                    (task.img as any).image_size = resData.size;
                                    task.img.format = 'jpg';
                                } else {
                                    task.img.data = task.input.toString('base64');
                                    task.img.size_bytes = task.input.length;
                                    (task.img as any).image_size = task.input.length;
                                }
                            }
                        }
                    }
                } catch (err: any) {
                    console.error(`[HML-V3-DOWNLOAD] VPS Resize Failed, fallback to original:`, err.message);
                    resizeTasks.forEach(t => {
                        t.img.data = t.input.toString('base64');
                        t.img.size_bytes = t.input.length;
                        (t.img as any).image_size = t.input.length;
                    });
                }
            }

            imgData.forEach(img => {
                const qid = img.question_id;
                if (!finalImagesByQuestion.has(qid)) finalImagesByQuestion.set(qid, []);
                finalImagesByQuestion.get(qid)!.push(img);
            });
        }

        // 3. Assemble and Generate
        const qMap = new Map(questions.map(q => [q.id, q]));
        const orderedQuestions = ids
            .map(id => qMap.get(id))
            .filter(q => q !== undefined);

        orderedQuestions.forEach((q: any, idx) => {
            q.question_number = idx + 1;
            if (!q.content_xml || q.content_xml.trim().length === 0) {
                q.content_xml = q.fragment_xml || `<P ParaShape="0" Style="0"><TEXT CharShape="0">[Error] Content Missing</TEXT></P>`;
            }
        });

        let templatePath = path.join(process.cwd(), '재조립양식.hml');
        if (!fs.existsSync(templatePath)) templatePath = path.join(process.cwd(), 'hml v2-test-tem.hml');
        if (!fs.existsSync(templatePath)) templatePath = path.join(process.cwd(), 'template.hml');
        if (!fs.existsSync(templatePath)) throw new Error('HML template missing');

        const templateContent = fs.readFileSync(templatePath, 'utf-8');
        const { generateHmlFromTemplate } = await import('@/lib/hml-v2/generator');

        const questionsWithImages = orderedQuestions.map(q => ({
            question: q,
            images: finalImagesByQuestion.get(q.id) || []
        }));

        const title = body.title || 'Admin_Exam_V3';
        const dateStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

        const result = await generateHmlFromTemplate(templateContent, questionsWithImages, {
            title: title,
            date: dateStr
        });

        console.log(`[HML-V3-DOWNLOAD] Generated: ${result.questionCount} questions, ${result.hmlContent.length} chars`);

        return new NextResponse(result.hmlContent, {
            status: 200,
            headers: {
                'Content-Type': 'application/xml',
                'Content-Disposition': `attachment; filename="hancom_exam_${Date.now()}.hml"`,
                'Cache-Control': 'no-store, no-cache, must-revalidate'
            }
        });

    } catch (e: any) {
        console.error('[HML-V3-DOWNLOAD] Fatal Error:', e);
        return new NextResponse('Internal Error: ' + e.message, { status: 500 });
    }
}
