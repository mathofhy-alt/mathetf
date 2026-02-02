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

            // [FIX] Resolve image URLs to Base64 (Manual Captures use URLs)
            if (imgData && imgData.length > 0) {
                console.log(`[SaveAPI] Resolving/Decompressing ${imgData.length} images...`);
                await Promise.all(imgData.map(async (img) => {
                    // Case 1: URL -> Base64
                    if (img.data && (img.data.startsWith('http://') || img.data.startsWith('https://'))) {
                        try {
                            const res = await fetch(img.data);
                            if (res.ok) {
                                let buffer = await res.arrayBuffer();

                                // [FIX] Apply Universal Resizing (ASYNC)
                                const resizeResult = await tryResizeImageAsync(Buffer.from(buffer), img.original_bin_id);
                                if (resizeResult.resized) {
                                    buffer = resizeResult.buffer;
                                    img.format = resizeResult.format || 'jpg';
                                    console.log(`[SaveAPI] Resized URL image ${img.id}`);
                                }

                                img.data = Buffer.from(buffer).toString('base64');
                                img.size_bytes = buffer.byteLength;

                                // Update format based on content-type if possible (and not resized)
                                if (!resizeResult.resized) {
                                    const contentType = res.headers.get('content-type');
                                    if (contentType?.includes('png')) img.format = 'png';
                                    else if (contentType?.includes('jpeg') || contentType?.includes('jpg')) img.format = 'jpg';
                                    else if (contentType?.includes('gif')) img.format = 'gif';
                                    else if (contentType?.includes('bmp')) img.format = 'bmp';
                                }
                            }
                        } catch (err) {
                            console.warn(`[SaveAPI] Failed to resolve image URL: ${img.data}`, err);
                        }
                    }
                    // Case 2: Native Compressed Data (Start with 72 f2 or other non-image headers)
                    // HML Native images are often DEFLATE raw streams.
                    // Since we can't easily check '72f2' on Base64 string efficiently without buffer alloc,
                    // We will try to inflate IF it is NOT a valid image header.
                    // BMP: BM, PNG: .PNG, JPG: FF D8
                    else if (img.data && typeof img.data === 'string') {
                        try {
                            let buffer = Buffer.from(img.data, 'base64');

                            // [FIX] Apply Universal Resizing First (ASYNC)
                            const resizeResult = await tryResizeImageAsync(buffer, img.original_bin_id);
                            if (resizeResult.resized) {
                                buffer = resizeResult.buffer;
                                img.data = buffer.toString('base64');
                                img.size_bytes = buffer.length;
                                img.format = resizeResult.format || 'jpg';
                                console.log(`[SaveAPI] Resized Base64 image ${img.id}`);
                                // Skip further compression checks if resized (already optimized JPG)
                                return;
                            }

                            const head = buffer.subarray(0, 2).toString('ascii');
                            const headHex = buffer.subarray(0, 2).toString('hex');

                            // If IT IS NOT a common image header (BM, PNG-ish, JPG-ish)
                            const isBmp = head === 'BM';
                            // PNG starts with 89 50 4E 47 (approx)
                            const isPng = headHex === '8950';
                            // JPG starts with FF D8
                            const isJpg = headHex === 'ffd8';

                            if (!isBmp && !isPng && !isJpg) {
                                // Check for zlib/deflate
                                // Try inflateRaw first (no header, common in HWP stream)
                                try {
                                    const inflated = zlib.inflateRawSync(buffer);

                                    // [FIX] Resize Inflated Content (ASYNC)
                                    const resizeResult2 = await tryResizeImageAsync(inflated, img.original_bin_id);
                                    if (resizeResult2.resized) {
                                        const redef = zlib.deflateRawSync(resizeResult2.buffer, { level: 9 });
                                        img.data = redef.toString('base64');
                                        img.size_bytes = resizeResult2.buffer.length;
                                        img.compressed = true;
                                        img.format = 'jpg';
                                        return;
                                    }

                                    // [OPTIMIZATION] Re-compress using Raw Deflate (like original)
                                    try {
                                        const deflated = zlib.deflateRawSync(inflated, { level: 9 });
                                        img.data = deflated.toString('base64');
                                        img.size_bytes = inflated.length;
                                        img.compressed = true;
                                    } catch (defErr) {
                                        img.data = inflated.toString('base64');
                                        img.size_bytes = inflated.length;
                                    }

                                    const newHead = inflated.subarray(0, 2).toString('ascii');
                                    if (newHead === 'BM') img.format = 'bmp';

                                } catch (zErr) {
                                    try {
                                        const inflated = zlib.inflateSync(buffer);

                                        // [FIX] Resize Inflated Content (ASYNC)
                                        const resizeResult3 = await tryResizeImageAsync(inflated, img.original_bin_id);
                                        if (resizeResult3.resized) {
                                            const redef = zlib.deflateRawSync(resizeResult3.buffer, { level: 9 });
                                            img.data = redef.toString('base64');
                                            img.size_bytes = resizeResult3.buffer.length;
                                            img.compressed = true;
                                            img.format = 'jpg';
                                            return;
                                        }

                                        try {
                                            const deflated = zlib.deflateRawSync(inflated, { level: 9 });
                                            img.data = deflated.toString('base64');
                                            img.size_bytes = inflated.length;
                                            img.compressed = true;
                                        } catch (defErr) {
                                            img.data = inflated.toString('base64');
                                            img.size_bytes = inflated.length;
                                        }
                                    } catch (zErr2) { }
                                }
                            } else {
                                // [OPTIMIZATION] Standard Images (BMP/JPG/PNG) -> Recompress
                                try {
                                    const deflated = zlib.deflateRawSync(buffer, { level: 9 });
                                    img.data = deflated.toString('base64');
                                    img.size_bytes = buffer.length;
                                    img.compressed = true;

                                    if (isBmp) img.format = 'bmp';
                                    else if (isPng) img.format = 'png';
                                    else if (isJpg) img.format = 'jpg';
                                } catch (compErr) { }
                            }
                        } catch (e) {
                            console.warn(`[SaveAPI] Error checking compression for ${img.id}`, e);
                        }
                    }
                }));
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

        // Load Template (Align with Admin fallback)
        console.log('[SaveAPI] Loading template...');
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
        const questionsWithImages = questions.map(q => ({
            question: q,
            images: q.images || []
        }));

        console.log('[SaveAPI] Generating HML...');
        const result = generateHmlFromTemplate(templateXml, questionsWithImages);
        const finalHml = result.hmlContent;
        log(`[SaveAPI] FINAL STATS:`);
        log(`  - Template Size: ${templateXml.length}`);
        log(`  - Image Count: ${result.imageCount}`);
        log(`  - Total HML Size: ${finalHml.length}`);

        // Debug: Log first 1000 chars of HML to see if there's obvious bloat at start
        log(`  - HML Head Snippet: ${finalHml.substring(0, 500)}`);

        console.log(`[SaveAPI] HML Generated. Size: ${finalHml.length}`);

        // --- Storage Upload ---
        // Fix: Use UUID for filename to satisfy DB constraints (reference_id must be UUID) and avoid encoding issues
        const fileId = crypto.randomUUID();
        const storageFilename = `${fileId}.hml`;
        const filePath = `${user.id}/${storageFilename}`;

        console.log(`[SaveAPI] Uploading to Storage: ${filePath}`);
        // For Storage, we upload to the path
        const { error: uploadError } = await supabase
            .storage
            .from('exams') // Bucket name
            .upload(filePath, finalHml, {
                contentType: 'application/x-hwp',
                upsert: false
            });

        if (uploadError) {
            console.error('[SaveAPI] Upload Error:', uploadError);
            throw new Error(`Upload failed: ${uploadError.message}`);
        }

        // --- Upload Metadata Sidecar (.json) ---
        const metaFilename = `${fileId}.json`;
        const metaPath = `${user.id}/${metaFilename}`;
        const metaData = {
            source_db_ids: Array.from(new Set(questions.map(q => q.source_db_id).filter(Boolean)))
        };

        console.log(`[SaveAPI] Uploading Metadata Sidecar: ${metaPath}`);
        await supabase.storage
            .from('exams')
            .upload(metaPath, JSON.stringify(metaData), {
                contentType: 'application/json',
                upsert: false
            });

        // --- DEBUG MANIFEST (Temporary for diagnosing size issues) ---
        const debugManifest = {
            timestamp: new Date().toISOString(),
            templateUsed: templatePath,
            totalQuestions: questions.length,
            ids: ids,
            images: questions.flatMap(q => (q.images || []).map((img: any) => ({
                id: img.id,
                original_bin_id: img.original_bin_id,
                originalSize: img.size_bytes, // Note: This might be updated size if recompressed
                dataLength: (img.data || '').length,
                format: img.format,
                compressed: img.compressed
            }))),
            // Track duplicate usage manually here if not tracking in generator
        };

        const debugPath = `${user.id}/${fileId}_debug.json`;
        console.log(`[SaveAPI] Uploading Debug Manifest: ${debugPath}`);
        await supabase.storage
            .from('exams')
            .upload(debugPath, JSON.stringify(debugManifest, null, 2), {
                contentType: 'application/json',
                upsert: false
            });


        // --- Create User Item ---
        console.log('[SaveAPI] Creating User Item in DB...');
        const displayTitle = title || 'Exam_Paper';

        const { data: itemData, error: itemError } = await supabase
            .from('user_items')
            .insert({
                user_id: user.id,
                folder_id: folderId === 'root' ? null : folderId,
                type: 'saved_exam',
                name: displayTitle,
                reference_id: fileId // Store UUID not path!
            })
            .select()
            .single();

        if (itemError) {
            console.error('[SaveAPI] Item Creation Error:', itemError);
            throw new Error(`Item creation failed: ${itemError.message}`);
        }

        console.log('[SaveAPI] Success!');
        return NextResponse.json({ success: true, item: itemData });

    } catch (e: any) {
        console.error('[SaveAPI] Fatal Error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
