import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { generateHmlFile } from '@/lib/hml-v2/generator';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export const dynamic = 'force-dynamic';

/**
 * HML V2 Download API
 * 
 * Generates HML files from selected questions with their associated images.
 * Uses the V2 generator for proper image embedding.
 */
import { requireAdmin } from '@/utils/admin-auth';

// ...

export async function POST(req: NextRequest) {
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
                if (img.data && (img.data.startsWith('http://') || img.data.startsWith('https://'))) {
                    try {
                        const res = await fetch(img.data);
                        if (res.ok) {
                            const buffer = await res.arrayBuffer();
                            img.data = Buffer.from(buffer).toString('base64');
                            const contentType = res.headers.get('content-type');
                            if (contentType?.includes('png')) img.format = 'png';
                            else if (contentType?.includes('jpeg') || contentType?.includes('jpg')) img.format = 'jpg';
                            else if (contentType?.includes('bmp')) img.format = 'bmp';
                        }
                    } catch (err) {
                        console.warn(`[HML-V2-DOWNLOAD] Failed to resolve image URL: ${img.data}`, err);
                    }
                }
                // Case 2: Native Compressed Data fallback
                else if (img.data && typeof img.data === 'string') {
                    try {
                        let buffer = Buffer.from(img.data, 'base64');
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
                                    const deflated = zlib.deflateRawSync(inflated);
                                    console.log(`[HML-V2-DOWNLOAD] Re-compressed image ${img.original_bin_id} (Raw Deflate) (Size: ${inflated.length} -> ${deflated.length})`);
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
                                    img.data = inflated.toString('base64');
                                } catch (zErr2) { }
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

        const result = generateHmlFromTemplate(templateContent, questionsWithImages);

        console.log(`[HML-V2-DOWNLOAD] Generated HML: ${result.questionCount} questions, ${result.imageCount} images, ${result.hmlContent.length} chars`);

        // 6. Return as downloadable file
        const filename = `exam_${Date.now()}.hml`;

        return new NextResponse(result.hmlContent, {
            status: 200,
            headers: {
                'Content-Type': 'application/x-hwp; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });

    } catch (e: any) {
        console.error('[HML-V2-DOWNLOAD] Error:', e);
        return new NextResponse('Internal Error: ' + e.message, { status: 500 });
    }
}
