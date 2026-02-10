import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { generateHmlFile } from '@/lib/hml-v2/generator';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import zlib from 'zlib';

export const dynamic = 'force-dynamic';

/**
 * HML V2 Download API
 * 
 * Generates HML files from selected questions with their associated images.
 * Uses the V2 generator for proper image embedding.
 */
import { requireAdmin } from '@/utils/admin-auth';

// [HELPER] Universal Resize Logic
const LOG_PATH = 'C:\\Users\\matho\\OneDrive\\바탕 화면\\안티그래비티 - 복사본\\node_hml_debug_ABSOLUTE.log';

function log(msg: string) {
    try { fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`); } catch (e) { }
}

function tryResizeImage(buffer: Buffer, originalId: string): { buffer: Buffer, resized: boolean, format?: string } {
    // Threshold: 10KB (Aggressive Debugging)
    if (buffer.length <= 10 * 1024) return { buffer, resized: false };

    try {
        log(`CHECK RESIZE ${originalId} Size: ${buffer.length}`);

        const tempId = Math.random().toString(36).substring(7);
        const tempInput = path.join(os.tmpdir(), `resize_in_${tempId}.bin`);
        const tempOutput = path.join(os.tmpdir(), `resize_out_${tempId}.jpg`);

        fs.writeFileSync(tempInput, buffer);

        const pythonPath = path.resolve(process.cwd(), 'hwpx-python-tool', 'venv', 'Scripts', 'python.exe');
        const scriptPath = path.resolve(process.cwd(), 'resize_image.py');

        // Check paths
        if (!fs.existsSync(pythonPath)) log(`ERROR: Python not found at ${pythonPath}`);
        if (!fs.existsSync(scriptPath)) log(`ERROR: Script not found at ${scriptPath}`);

        execFileSync(pythonPath, [scriptPath, tempInput, tempOutput]);

        if (fs.existsSync(tempOutput)) {
            const outBuffer = fs.readFileSync(tempOutput);
            fs.unlinkSync(tempInput);
            fs.unlinkSync(tempOutput);
            log(`RESIZED ${originalId}: ${buffer.length} -> ${outBuffer.length}`);
            return { buffer: outBuffer, resized: true, format: 'jpg' };
        } else {
            log(`RESIZE FAILED (No Output) ${originalId}`);
        }
    } catch (err: any) {
        log(`RESIZE CRASH ${originalId}: ${err.message}`);
    }
    return { buffer, resized: false };
}

export async function POST(req: NextRequest) {
    log('--- V3 ENDPOINT HIT ---');

    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    const supabase = createClient();
    // Removed duplicate auth check as requireAdmin handles it


    // Removed duplicate auth check as requireAdmin handles it

    try {
        const body = await req.json();
        const ids: string[] = body.ids || [];

        if (ids.length === 0) {
            return new NextResponse('No question IDs provided', { status: 400 });
        }

        console.log(`[HML-V2-DOWNLOAD] Generating HML for ${ids.length} questions`);

        // 1. Fetch questions
        const { data: questions, error: qError } = await supabase
            .from('questions')
            .select('*')
            .in('id', ids);

        if (qError) throw new Error('Failed to fetch questions: ' + qError.message);
        if (!questions || questions.length === 0) {
            return new NextResponse('No questions found', { status: 404 });
        }

        // Maintain order based on input IDs
        const qMap = new Map(questions.map(q => [q.id, q]));
        const orderedQuestions = ids
            .map(id => qMap.get(id))
            .filter(q => q !== undefined);

        // 2. Fetch images for all questions
        const { data: images, error: imgError } = await supabase
            .from('question_images')
            .select('*')
            .in('question_id', ids);

        if (imgError) {
            console.warn('[HML-V2-DOWNLOAD] Image fetch warning:', imgError.message);
        }

        // [BATCH OPTIMIZATION V3] Resolve and Batch Resize
        if (images && images.length > 0) {
            console.log(`[HML-V3-DOWNLOAD] Resolving ${images.length} images for batch processing...`);

            const resizeTasks: { input: string, output: string, img: any }[] = [];
            const tempFiles: string[] = [];

            await Promise.all(images.map(async (img) => {
                let buffer: Buffer | null = null;

                // 1. Resolve to Buffer (URL or Base64)
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
                        // Decompress if needed (Same logic as save/route)
                        const headHex = buffer.subarray(0, 2).toString('hex');
                        if (headHex !== '8950' && headHex !== 'ffd8' && buffer.subarray(0, 2).toString('ascii') !== 'BM') {
                            try { buffer = zlib.inflateRawSync(buffer); } catch (e) {
                                try { buffer = zlib.inflateSync(buffer); } catch (e2) { }
                            }
                        }
                    } catch (e) { }
                }

                if (!buffer) return;

                // 2. Filter for resizing (Threshold: 50KB)
                if (buffer.length > 50 * 1024) {
                    const tempIn = path.join(os.tmpdir(), `v3batch_in_${Math.random().toString(36).substring(7)}.bin`);
                    const tempOut = path.join(os.tmpdir(), `v3batch_out_${Math.random().toString(36).substring(7)}.jpg`);
                    fs.writeFileSync(tempIn, buffer);
                    resizeTasks.push({ input: tempIn, output: tempOut, img });
                    tempFiles.push(tempIn, tempOut);
                } else {
                    img.data = buffer.toString('base64');
                    img.size_bytes = buffer.length;
                    (img as any).image_size = buffer.length;
                }
            }));

            // 3. Execute Batch Resize
            if (resizeTasks.length > 0) {
                console.log(`[HML-V3-DOWNLOAD] Executing Batch Resize for ${resizeTasks.length} images...`);
                const pythonPath = path.resolve(process.cwd(), 'hwpx-python-tool', 'venv', 'Scripts', 'python.exe');
                const scriptPath = path.resolve(process.cwd(), 'scripts', 'batch_resize_image.py');

                try {
                    const inputJson = JSON.stringify({
                        tasks: resizeTasks.map(t => ({ input: t.input, output: t.output })),
                        max_width: 1000,
                        quality: 80
                    });

                    const { spawn } = await import('child_process');
                    const batchResult = await new Promise<any>((resolve, reject) => {
                        const child = spawn(pythonPath, [scriptPath]);
                        let stdout = '';
                        let stderr = '';
                        child.stdout.on('data', (data) => stdout += data);
                        child.stderr.on('data', (data) => stderr += data);
                        child.on('close', (code) => {
                            if (code === 0) {
                                try { resolve(JSON.parse(stdout)); }
                                catch (e) { reject(new Error('Invalid JSON output from Python')); }
                            } else {
                                reject(new Error(`Python exited with code ${code}: ${stderr}`));
                            }
                        });
                        child.stdin.write(inputJson);
                        child.stdin.end();
                    });

                    if (batchResult.success) {
                        console.log(`[HML-V3-DOWNLOAD] Batch Resize Success. Elapsed: ${batchResult.elapsed_ms}ms`);
                        for (let i = 0; i < resizeTasks.length; i++) {
                            const task = resizeTasks[i];
                            if (fs.existsSync(task.output)) {
                                const outBuffer = fs.readFileSync(task.output);
                                if (outBuffer.length < fs.statSync(task.input).size) {
                                    task.img.data = outBuffer.toString('base64');
                                    task.img.size_bytes = outBuffer.length;
                                    (task.img as any).image_size = outBuffer.length;
                                    task.img.format = 'jpg';
                                } else {
                                    const origBuffer = fs.readFileSync(task.input);
                                    task.img.data = origBuffer.toString('base64');
                                    task.img.size_bytes = origBuffer.length;
                                    (task.img as any).image_size = origBuffer.length;
                                }
                            }
                        }
                    }
                } catch (err: any) {
                    console.error(`[HML-V3-DOWNLOAD] Batch Resize Failed:`, err.message);
                } finally {
                    tempFiles.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) { } });
                }
            }
        }

        // Group images by question_id
        const imagesByQuestion = new Map<string, any[]>();
        if (images) {
            for (const img of images) {
                const qid = img.question_id;
                if (!imagesByQuestion.has(qid)) {
                    imagesByQuestion.set(qid, []);
                }
                imagesByQuestion.get(qid)!.push(img);
            }
        }

        console.log(`[HML-V2-DOWNLOAD] Loaded ${images?.length || 0} images for ${imagesByQuestion.size} questions`);

        // 3. Reassign question numbers sequentially
        orderedQuestions.forEach((q, idx) => {
            q.question_number = idx + 1;
            // Ensure content_xml exists
            if (!q.content_xml || q.content_xml.trim().length === 0) {
                q.content_xml = q.fragment_xml || `<P ParaShape="0" Style="0"><TEXT CharShape="0">[Error] Content Missing</TEXT></P>`;
            }
        });

        // 4. Load template (Prefer 2-column template)
        let templatePath = path.join(process.cwd(), '재조립양식.hml');
        if (!fs.existsSync(templatePath)) {
            templatePath = path.join(process.cwd(), 'hml v2-test-tem.hml');
        }
        if (!fs.existsSync(templatePath)) {
            templatePath = path.join(process.cwd(), 'template.hml');
        }

        if (!fs.existsSync(templatePath)) return new NextResponse('HML template missing', { status: 500 });
        const templateContent = fs.readFileSync(templatePath, 'utf-8');

        // 5. Generate HML using V2 generator
        const { generateHmlFromTemplate } = await import('@/lib/hml-v2/generator');

        const questionsWithImages = orderedQuestions.map(q => ({
            question: q,
            images: imagesByQuestion.get(q.id) || []
        }));

        const title = (body && body.title) || 'Admin_Exam_V3';
        const dateObj = new Date();
        const dateStr = `${dateObj.getFullYear()}년 ${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일`;

        const result = generateHmlFromTemplate(templateContent, questionsWithImages, {
            title: title,
            date: dateStr
        });

        try {
            fs.appendFileSync('node_hml_debug.log', `[${new Date().toISOString()}] FINAL HML SIZE: ${result.hmlContent.length} chars. ImageCount: ${result.imageCount}\n`);
        } catch (e) { }

        console.log(`[HML-V2-DOWNLOAD] Generated HML: ${result.questionCount} questions, ${result.imageCount} images, ${result.hmlContent.length} chars`);

        // 6. Return as downloadable file
        const filename = `exam_${Date.now()}.hml`;

        // Generate Response
        // [FIX] Add Cache-Control to prevent "Same 5.4MB Size" due to browser caching
        return new NextResponse(result.hmlContent, {
            status: 200,
            headers: {
                'Content-Type': 'application/xml',
                'Content-Disposition': `attachment; filename="hancom_exam_${Date.now()}_optimized.hml"`,
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            }
        });

    } catch (e: any) {
        console.error('[HML-V2-DOWNLOAD] Error:', e);
        return new NextResponse('Internal Error: ' + e.message, { status: 500 });
    }
}
