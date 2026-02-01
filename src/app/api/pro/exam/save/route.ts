
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export const dynamic = 'force-dynamic'; // Prevent caching

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
                                const buffer = await res.arrayBuffer();
                                img.data = Buffer.from(buffer).toString('base64');
                                // Update format based on content-type if possible
                                const contentType = res.headers.get('content-type');
                                if (contentType?.includes('png')) img.format = 'png';
                                else if (contentType?.includes('jpeg') || contentType?.includes('jpg')) img.format = 'jpg';
                                else if (contentType?.includes('gif')) img.format = 'gif';
                                else if (contentType?.includes('bmp')) img.format = 'bmp';
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
                                    // Synchronous is fine for now, or async if needed.
                                    // Using sync for simplicity in map
                                    const inflated = zlib.inflateRawSync(buffer);
                                    console.log(`[SaveAPI] Decompressed image ${img.id} (${img.original_bin_id}) from ${buffer.length} to ${inflated.length}`);

                                    // [OPTIMIZATION] Re-compress using Raw Deflate (like original)
                                    // Standard zlib.deflateSync adds a header (78 9C) which Hancom might reject if it expects Raw.
                                    try {
                                        const deflated = zlib.deflateRawSync(inflated);
                                        console.log(`[SaveAPI] Re-compressed image ${img.id} (Raw Deflate) (Size: ${inflated.length} -> ${deflated.length})`);
                                        img.data = deflated.toString('base64');
                                        // Original Uncompressed Size is needed for Size attribute in BINDATA
                                        img.size_bytes = inflated.length;
                                        img.compressed = true;
                                    } catch (defErr) {
                                        console.warn(`[SaveAPI] Re-compression failed for ${img.id}`, defErr);
                                        // Fallback to uncompressed
                                        img.data = inflated.toString('base64');
                                        img.size_bytes = inflated.length;
                                    }

                                    // If we inflated it, it's likely BMP or original format.
                                    // Check header of inflated
                                    const newHead = inflated.subarray(0, 2).toString('ascii');
                                    if (newHead === 'BM') img.format = 'bmp';

                                } catch (zErr) {
                                    // Try standard inflate (zlib header)
                                    try {
                                        const inflated = zlib.inflateSync(buffer);
                                        console.log(`[SaveAPI] Decompressed (ZLIB) image ${img.id} (${img.original_bin_id})`);
                                        img.data = inflated.toString('base64');
                                    } catch (zErr2) {
                                        // Not compressed or unknown format. Keep original.
                                    }
                                }
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
