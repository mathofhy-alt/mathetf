import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import { execFile } from 'child_process';
import util from 'util';

const execFileAsync = util.promisify(execFile);

export const dynamic = 'force-dynamic'; // Prevent caching

// [HELPER] Universal Resize Logic (Copied from Admin V3)
const LOG_PATH = 'C:\\Users\\matho\\OneDrive\\바탕 화면\\안티그래비티 - 복사본\\node_hml_debug_ABSOLUTE.log';

function log(msg: string) {
    try { fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] [SAVE-API] ${msg}\n`); } catch (e) { }
}

async function tryResizeImageAsync(buffer: Buffer, originalId: string): Promise<{ buffer: Buffer, resized: boolean, format?: string }> {
    // Threshold: 50KB (Trust Deduplication & Quality Restore)
    if (buffer.length <= 50 * 1024) return { buffer, resized: false };

    try {
        log(`CHECK RESIZE ${originalId} Size: ${buffer.length}`);

        const tempId = Math.random().toString(36).substring(7);
        const tempInput = path.join(os.tmpdir(), `resize_in_${tempId}.bin`);
        const tempOutput = path.join(os.tmpdir(), `resize_out_${tempId}.jpg`);

        fs.writeFileSync(tempInput, buffer);

        const pythonPath = path.resolve(process.cwd(), 'hwpx-python-tool', 'venv', 'Scripts', 'python.exe');
        const scriptPath = path.resolve(process.cwd(), 'resize_image.py');

        try {
            // Async Execution (Parallel)
            await execFileAsync(pythonPath, [scriptPath, tempInput, tempOutput]);
        } catch (execErr: any) {
            log(`RESIZE EXEC FAIL ${originalId}: ${execErr.message}`);
            if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
            if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
            return { buffer, resized: false };
        }

        if (fs.existsSync(tempOutput)) {
            const outBuffer = fs.readFileSync(tempOutput);
            fs.unlinkSync(tempInput);
            fs.unlinkSync(tempOutput);

            // [CRITICAL] Only use if smaller!
            if (outBuffer.length < buffer.length) {
                log(`RESIZED ${originalId}: ${buffer.length} -> ${outBuffer.length} (SAVED ${(buffer.length - outBuffer.length).toLocaleString()} bytes)`);
                return { buffer: outBuffer, resized: true, format: 'jpg' };
            } else {
                log(`RESIZE DISCARDED ${originalId}: ${buffer.length} -> ${outBuffer.length} (Larger)`);
                return { buffer, resized: false };
            }
        } else {
            log(`RESIZE FAILED (No Output) ${originalId}`);
        }
    } catch (err: any) {
        log(`RESIZE CRASH ${originalId}: ${err.message}`);
    }
    return { buffer, resized: false };
}


export async function POST(req: NextRequest) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return new NextResponse('Unauthorized', { status: 401 });

    try {
        console.log('[SaveAPI] Request received');
        const body = await req.json();
        const { ids, questions: rawQuestions, title, folderId } = body;
        console.log(`[SaveAPI] Parsed Body. Title: ${title}, Folder: ${folderId}, Q_Count: ${rawQuestions?.length}, IDs: ${ids?.length}`);

        let questions: any[] = rawQuestions || [];

        // Always fetch from DB if IDs are provided to ensure we have complete records (including images)
        if (ids && ids.length > 0) {
            console.log('[SaveAPI] Fetching full data from DB...');
            // 1. Fetch questions
            const { data: qData, error: qError } = await supabase
                .from('questions')
                .select('*')
                .in('id', ids);

            if (qError) throw new Error("DB Fetch Error (Questions): " + qError.message);

            // 2. Fetch images separately (Admin API pattern)
            const { data: imgData, error: imgError } = await supabase
                .from('question_images')
                .select('*')
                .in('question_id', ids);

            if (imgError) console.warn('[SaveAPI] Image fetch warning:', imgError.message);

            // [BATCH OPTIMIZATION V2] Resolve and Batch Resize
            if (imgData && imgData.length > 0) {
                console.log(`[SaveAPI] Resolving ${imgData.length} images for batch processing...`);

                const resizeTasks: { input: string, output: string, img: any }[] = [];
                const tempFiles: string[] = [];

                await Promise.all(imgData.map(async (img) => {
                    let buffer: Buffer | null = null;

                    // 1. Resolve to Buffer
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

                    // 2. Filter for resizing (Threshold: 50KB)
                    if (buffer.length > 50 * 1024) {
                        const tempIn = path.join(os.tmpdir(), `batch_in_${Math.random().toString(36).substring(7)}.bin`);
                        const tempOut = path.join(os.tmpdir(), `batch_out_${Math.random().toString(36).substring(7)}.jpg`);
                        fs.writeFileSync(tempIn, buffer);
                        resizeTasks.push({ input: tempIn, output: tempOut, img });
                        tempFiles.push(tempIn, tempOut);
                    } else {
                        // Smaller images: Just update if it was a URL or decompressed
                        img.data = buffer.toString('base64');
                        img.size_bytes = buffer.length;
                    }
                }));

                // 3. Execute Batch Resize
                if (resizeTasks.length > 0) {
                    console.log(`[SaveAPI] Executing Batch Resize for ${resizeTasks.length} images...`);
                    const pythonPath = path.resolve(process.cwd(), 'hwpx-python-tool', 'venv', 'Scripts', 'python.exe');
                    const scriptPath = path.resolve(process.cwd(), 'scripts', 'batch_resize_image.py');

                    try {
                        const inputJson = JSON.stringify({
                            tasks: resizeTasks.map(t => ({ input: t.input, output: t.output })),
                            max_width: 1000,
                            quality: 80
                        });

                        // [REPLACE] Use spawn to handle large stdin safely
                        const { spawn } = await import('child_process');
                        const result = await new Promise<any>((resolve, reject) => {
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

                        if (result.success) {
                            console.log(`[SaveAPI] Batch Resize Success. Elapsed: ${result.elapsed_ms}ms`);
                            for (let i = 0; i < resizeTasks.length; i++) {
                                const task = resizeTasks[i];
                                if (fs.existsSync(task.output)) {
                                    const outBuffer = fs.readFileSync(task.output);
                                    if (outBuffer.length < fs.statSync(task.input).size) {
                                        task.img.data = outBuffer.toString('base64');
                                        task.img.size_bytes = outBuffer.length;
                                        task.img.format = 'jpg';
                                    } else {
                                        // If not smaller, use original (buffer already read)
                                        const origBuffer = fs.readFileSync(task.input);
                                        task.img.data = origBuffer.toString('base64');
                                        task.img.size_bytes = origBuffer.length;
                                    }
                                }
                            }
                        }
                    } catch (err: any) {
                        console.error(`[SaveAPI] Batch Resize Failed:`, err.message);
                    } finally {
                        // Cleanup
                        tempFiles.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) { } });
                    }
                }
            }

            // Group images by question_id
            const imagesByQuestion = new Map<string, any[]>();
            if (imgData) {
                for (const img of imgData) {
                    const qid = img.question_id;
                    if (!imagesByQuestion.has(qid)) imagesByQuestion.set(qid, []);
                    imagesByQuestion.get(qid)!.push(img);
                }
            }

            if (qData) {
                console.log(`[SaveAPI] Fetched ${qData.length} questions and ${imgData?.length || 0} images.`);
                // Reset questions array
                questions = [];
                // Correct ordering based on input IDs
                const qMap = new Map(qData.map(q => [q.id, q]));
                ids.forEach((id: string) => {
                    const q = qMap.get(id);
                    if (q) {
                        // Attach images to the question object for the map below
                        q.images = imagesByQuestion.get(q.id) || [];
                        questions.push(q);
                    }
                });
            }
        }

        if (questions.length === 0) return NextResponse.json({ success: false, error: 'No questions provided' }, { status: 400 });

        // Prepare Questions
        questions.forEach((q, idx) => {
            if (!q.content_xml || q.content_xml.trim().length === 0) {
                q.content_xml = q.fragment_xml || `<P ParaShape="0" Style="0"><TEXT CharShape="0">[Error] Content Missing</TEXT></P>`;
            }
            q.question_number = idx + 1;
        });

        // Load Template
        let templatePath = path.join(process.cwd(), '재조립양식.hml');
        if (!fs.existsSync(templatePath)) {
            templatePath = path.join(process.cwd(), 'hml v2-test-tem.hml'); // Match Admin
        }
        if (!fs.existsSync(templatePath)) {
            templatePath = path.join(process.cwd(), 'template.hml');
        }
        if (!fs.existsSync(templatePath)) throw new Error('Template file missing');

        const templateXml = fs.readFileSync(templatePath, 'utf-8');

        // Generate HML
        const { generateHmlFromTemplate } = await import('@/lib/hml-v2/generator');

        // [DEBUG VALIDATION]
        if (!Array.isArray(questions)) {
            throw new Error(`Questions is not an array: ${typeof questions}`);
        }

        const questionsWithImages = questions.map((q, idx) => {
            if (!q) throw new Error(`Question at index ${idx} is null/undefined`);
            return {
                question: q,
                images: q.images || []
            };
        });

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');

        // [FIX] Correct Argument Passing: (string, array, object)
        const result = await generateHmlFromTemplate(
            templateXml,
            questionsWithImages,
            {
                title: title || 'Exam_Paper',
                date: dateStr
            }
        );

        if (!result) throw new Error("Generator returned null/undefined");

        const finalHml = result.hmlContent;
        log(`[SaveAPI] FINAL STATS:`);
        log(`  - Template Size: ${templateXml.length}`);
        log(`  - Image Count: ${result.imageCount}`);
        log(`  - Total HML Size: ${finalHml.length}`);

        // --- Storage Upload ---
        const fileId = crypto.randomUUID();
        const storageFilename = `${fileId}.hml`;
        const filePath = `${user.id}/${storageFilename}`;

        const { error: uploadError } = await supabase
            .storage
            .from('exams')
            .upload(filePath, finalHml, {
                contentType: 'application/x-hwp',
                upsert: false
            });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        // --- Upload Metadata Sidecar (.json) ---
        const metaFilename = `${fileId}.json`;
        const metaPath = `${user.id}/${metaFilename}`;

        // Calculate average difficulty
        const totalDifficulty = questions.reduce((sum: number, q: any) => sum + (Number(q.difficulty) || 0), 0);
        const avgDifficulty = questions.length > 0 ? Number((totalDifficulty / questions.length).toFixed(2)) : 0;

        const metaData = {
            source_db_ids: Array.from(new Set(questions.map((q: any) => q.source_db_id).filter(Boolean))),
            question_count: questions.length,
            average_difficulty: avgDifficulty,
            title: title || 'Exam_Paper',
            created_at: new Date().toISOString()
        };

        console.log(`[SaveAPI] Uploading Metadata Sidecar: ${metaPath}`);
        await supabase.storage
            .from('exams')
            .upload(metaPath, JSON.stringify(metaData), {
                contentType: 'application/json',
                upsert: false
            });

        // --- Create User Item ---
        // Do NOT insert into deleted 'saved_exams' table.
        // Do NOT insert into 'user_items' details (column likely missing).
        const displayTitle = title || 'Exam_Paper';

        const { data: itemData, error: itemError } = await supabase
            .from('user_items')
            .insert({
                user_id: user.id,
                folder_id: folderId === 'root' ? null : folderId,
                type: 'saved_exam',
                name: displayTitle,
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
