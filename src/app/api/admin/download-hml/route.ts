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
function tryResizeImage(buffer: Buffer, originalId: string): { buffer: Buffer, resized: boolean, format?: string } {
    // Threshold: 100KB
    if (buffer.length <= 100 * 1024) return { buffer, resized: false };

    try {
        // Log Input
        try { fs.appendFileSync('node_hml_debug.log', `[${new Date().toISOString()}] CHECK RESIZE ${originalId} Size: ${buffer.length}\n`); } catch (e) { }

        const tempId = Math.random().toString(36).substring(7);
        const tempInput = path.join(os.tmpdir(), `resize_in_${tempId}.bin`);
        const tempOutput = path.join(os.tmpdir(), `resize_out_${tempId}.jpg`);

        fs.writeFileSync(tempInput, buffer);

        const pythonPath = path.resolve(process.cwd(), 'hwpx-python-tool', 'venv', 'Scripts', 'python.exe');
        const scriptPath = path.resolve(process.cwd(), 'resize_image.py');

        execFileSync(pythonPath, [scriptPath, tempInput, tempOutput]);

        if (fs.existsSync(tempOutput)) {
            const outBuffer = fs.readFileSync(tempOutput);

            // Cleanup
            fs.unlinkSync(tempInput);
            fs.unlinkSync(tempOutput);

            try { fs.appendFileSync('node_hml_debug.log', `[${new Date().toISOString()}] RESIZED ${originalId}: ${buffer.length} -> ${outBuffer.length}\n`); } catch (e) { }

            return { buffer: outBuffer, resized: true, format: 'jpg' };
        } else {
            try { fs.appendFileSync('node_hml_debug.log', `[${new Date().toISOString()}] RESIZE FAILED (No Output) ${originalId}\n`); } catch (e) { }
        }
    } catch (err: any) {
        try { fs.appendFileSync('node_hml_debug.log', `[${new Date().toISOString()}] RESIZE CRASH ${originalId}: ${err.message}\n`); } catch (e) { }
        console.warn(`[HML-V2] Resize failed for ${originalId}`, err);
    }
    return { buffer, resized: false };
}

export async function POST(req: NextRequest) {
    try { fs.appendFileSync('C:\\Users\\matho\\OneDrive\\바탕 화면\\안티그래비티 - 복사본\\node_hml_debug_ABSOLUTE.log', `[${new Date().toISOString()}] [V2-ENDPOINT-HIT] Request Received\n`); } catch (e) { }

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

        // [FIX] Resolve image URLs to Base64 (Manual Captures use URLs)
        if (images && images.length > 0) {
            console.log(`[HML-V2-DOWNLOAD] Resolving ${images.length} images...`);
            await Promise.all(images.map(async (img) => {
                if (img.data && (typeof img.data === 'string') && (img.data.trim().startsWith('http://') || img.data.trim().startsWith('https://'))) {
                    const url = img.data.trim();
                    console.log(`[HML-V2-DOWNLOAD] Detected URL for ${img.original_bin_id}. Using Supabase Storage Download...`);

                    try {
                        // Extract Bucket and Path from URL
                        // Pattern: .../storage/v1/object/public/<BUCKET>/<PATH>
                        const publicMarker = '/public/';
                        const splitIdx = url.indexOf(publicMarker);

                        if (splitIdx !== -1) {
                            const fullPath = url.substring(splitIdx + publicMarker.length);
                            const slashIdx = fullPath.indexOf('/');
                            if (slashIdx !== -1) {
                                const bucket = fullPath.substring(0, slashIdx);
                                const filePath = fullPath.substring(slashIdx + 1);

                                console.log(`[HML-V2-DOWNLOAD] Downloading from Bucket: '${bucket}', Path: '${filePath}'`);

                                const { data: blob, error: dlError } = await supabase
                                    .storage
                                    .from(bucket)
                                    .download(filePath);

                                if (dlError) {
                                    console.error(`[HML-V2-DOWNLOAD] Supabase Download FAILED for ${img.original_bin_id}:`, dlError);
                                } else if (blob) {
                                    let buffer = await blob.arrayBuffer();

                                    // [FIX] Apply Universal Resizing
                                    const resizeResult = tryResizeImage(Buffer.from(buffer), img.original_bin_id);
                                    if (resizeResult.resized) {
                                        buffer = resizeResult.buffer; // ArrayBuffer compatible? Buffer is subclass
                                        img.format = resizeResult.format || 'jpg';
                                    }

                                    const b64 = resizeResult.buffer.toString('base64');
                                    console.log(`[HML-V2-DOWNLOAD] Download Success for ${img.original_bin_id}. Size: ${buffer.byteLength}`);
                                    img.data = b64;
                                    img.size_bytes = buffer.byteLength;
                                    (img as any).image_size = buffer.byteLength;

                                    // Determine format (if not forced by resize)
                                    if (!resizeResult.resized) {
                                        const type = blob.type;
                                        if (type.includes('png')) img.format = 'png';
                                        else if (type.includes('jpeg') || type.includes('jpg')) img.format = 'jpg';
                                        else if (type.includes('bmp')) img.format = 'bmp';
                                        else if (filePath.endsWith('.svg')) img.format = 'svg';
                                    }
                                }
                            } else {
                                console.warn(`[HML-V2-DOWNLOAD] Could not parse path from URL: ${url}`);
                            }
                        } else {
                            // Fallback to fetch if not a Supabase Public URL (e.g. external)
                            console.log(`[HML-V2-DOWNLOAD] Not a standard Supabase URL, falling back to fetch: ${url}`);
                            const res = await fetch(url);
                            if (res.ok) {
                                const buffer = await res.arrayBuffer();

                                // [FIX] Apply Universal Resizing
                                const resizeResult = tryResizeImage(Buffer.from(buffer), img.original_bin_id);
                                if (resizeResult.resized) {
                                    img.format = resizeResult.format || 'jpg';
                                }

                                img.data = resizeResult.buffer.toString('base64');
                                img.size_bytes = resizeResult.buffer.byteLength;
                                (img as any).image_size = resizeResult.buffer.byteLength;
                            }
                        }

                    } catch (err) {
                        console.error(`[HML-V2-DOWNLOAD] Failed to resolve image URL: ${url}`, err);
                    }
                }
                // Case 2: Native Compressed Data fallback
                else if (img.data && typeof img.data === 'string') {
                    try {
                        let buffer = Buffer.from(img.data, 'base64');
                        // [FIX] Always initialize size
                        img.size_bytes = buffer.length;
                        (img as any).image_size = buffer.length;

                        // [OPTIMIZATION] Downscale Large Images via Python (Pillow)
                        const resizeResult = tryResizeImage(buffer, img.original_bin_id);
                        if (resizeResult.resized) {
                            buffer = resizeResult.buffer;
                            img.data = buffer.toString('base64');
                            img.size_bytes = buffer.length;
                            (img as any).image_size = buffer.length;
                            img.format = resizeResult.format || 'jpg';
                        }
                        const head = buffer.subarray(0, 2).toString('ascii');
                        const headHex = buffer.subarray(0, 2).toString('hex');
                        const isBmp = head === 'BM';
                        const isPng = headHex === '8950';
                        const isJpg = headHex === 'ffd8';

                        if (!isBmp && !isPng && !isJpg) {
                            try {
                                const inflated = zlib.inflateRawSync(buffer);
                                console.log(`[HML-V2-DOWNLOAD] Decompressed image ${img.original_bin_id} (${buffer.length} -> ${inflated.length})`);

                                // [OPTIMIZATION] Re-compress using Raw Deflate (like original)
                                try {
                                    const deflated = zlib.deflateRawSync(inflated, { level: 9 });
                                    console.log(`[HML-V2-DOWNLOAD] Re-compressed image ${img.original_bin_id} (Raw Deflate L9) (Size: ${inflated.length} -> ${deflated.length})`);
                                    img.data = deflated.toString('base64');
                                    img.size_bytes = inflated.length; // Uncompressed Size
                                    img.compressed = true;
                                } catch (defErr) {
                                    console.warn(`[HML-V2-DOWNLOAD] Re-compression failed for ${img.original_bin_id}`, defErr);
                                    img.data = inflated.toString('base64');
                                    img.size_bytes = inflated.length;
                                }

                                const newHead = inflated.subarray(0, 2).toString('ascii');
                                if (newHead === 'BM') img.format = 'bmp';
                            } catch (zErr) {
                                try {
                                    const inflated = zlib.inflateSync(buffer);
                                    console.log(`[HML-V2-DOWNLOAD] Decompressed (ZLIB) image ${img.original_bin_id}`);

                                    // [OPTIMIZATION] Re-compress using Raw Deflate
                                    try {
                                        const deflated = zlib.deflateRawSync(inflated, { level: 9 });
                                        console.log(`[HML-V2-DOWNLOAD] Re-compressed ZLIB image ${img.original_bin_id} (Size: ${inflated.length} -> ${deflated.length})`);
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
                            // [OPTIMIZATION] Force Compression for BMP/PNG/JPG (Standard Images)
                            // HML expects Deflated streams for best compatibility and size.
                            try {
                                const deflated = zlib.deflateRawSync(buffer, { level: 9 });
                                // console.log(`[HML-V2-DOWNLOAD] Compressed Standard Image ${img.original_bin_id} (${buffer.length} -> ${deflated.length})`);
                                img.data = deflated.toString('base64');
                                img.size_bytes = buffer.length; // Original Uncompressed Size
                                img.compressed = true;

                                // Ensure Format
                                if (isBmp) img.format = 'bmp';
                                else if (isPng) img.format = 'png';
                                else if (isJpg) img.format = 'jpg';

                            } catch (compErr) {
                                console.warn(`[HML-V2-DOWNLOAD] Compression failed for ${img.original_bin_id}`, compErr);
                            }
                        }
                    } catch (e) {
                        console.warn('[HML-V2-DOWNLOAD] Decompression check failed', e);
                    }
                }
            }));
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

        const title = (body && body.title) || 'Admin_Exam';
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
