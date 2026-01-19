import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { parseHmlV2 } from '@/lib/hml-v2/parser';

const STORAGE_BUCKET = 'hwpx';

/**
 * HML V2 Upload API
 * 
 * Parses HML files using the V2 parser and stores:
 * - Questions in 'questions' table
 * - Images in 'question_images' table
 */
export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        // Metadata from form
        const school = formData.get('school') as string || '';
        const region = formData.get('region') as string || '';
        const district = formData.get('district') as string || '';
        const year = formData.get('year') as string || '';
        const semester = formData.get('semester') as string || '';
        const subject = formData.get('subject') as string || '';
        const grade = formData.get('grade') as string || '';

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
        }

        // Only allow .hml files
        if (!file.name.toLowerCase().endsWith('.hml')) {
            return NextResponse.json({ success: false, error: 'Only .hml files allowed' }, { status: 400 });
        }

        const supabase = createClient();

        // Read file content as text (HML is XML-based)
        const hmlContent = await file.text();
        console.log(`[HML-V2-INGEST] File: ${file.name}, Size: ${hmlContent.length} chars`);

        // 1. Parse HML using V2 parser
        const { questions, images } = parseHmlV2(hmlContent);
        console.log(`[HML-V2-INGEST] Parsed ${questions.length} questions, ${images.length} images`);

        if (questions.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'No questions found in HML file'
            }, { status: 400 });
        }

        // 2. Create file record
        const fileId = crypto.randomUUID();
        const storagePath = `raw_uploads/${fileId}.hml`;

        // Upload raw HML to storage (for backup/reference)
        const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, hmlContent, { contentType: 'text/xml' });

        if (uploadError) {
            console.warn('[HML-V2-INGEST] Storage upload warning:', uploadError.message);
            // Continue anyway - storage is optional for HML
        }

        // Insert to files table
        const { error: fileDbError } = await supabase
            .from('files')
            .insert({
                id: fileId,
                original_name: file.name,
                storage_path: storagePath
            });

        if (fileDbError) {
            throw new Error('Failed to record file metadata: ' + fileDbError.message);
        }

        const source_db_id = `${school}_${year}_${semester}_${subject}`;
        const savedQuestionIds: string[] = [];
        const imageMap = new Map(images.map(img => [img.binId, img]));

        // 3. Insert questions and their images
        for (const q of questions) {
            // Insert question
            const { data: qData, error: qError } = await supabase
                .from('questions')
                .insert({
                    file_id: fileId,
                    question_index: q.questionNumber,
                    fragment_xml: q.contentXml,
                    fragment_len: q.contentXml.length,
                    content_xml: q.contentXml,
                    subject,
                    region,
                    district,
                    school,
                    grade,
                    year,
                    semester,
                    source_db_id,
                    question_number: q.questionNumber
                })
                .select('id')
                .single();

            if (qError) {
                console.error(`[HML-V2-INGEST] Q${q.questionNumber} insert error:`, qError);
                continue;
            }

            savedQuestionIds.push(qData.id);

            // 4. Insert associated images
            for (const binId of q.imageRefs) {
                const img = imageMap.get(binId);
                if (!img) {
                    console.warn(`[HML-V2-INGEST] Image ${binId} referenced but not found`);
                    continue;
                }

                const { error: imgError } = await supabase
                    .from('question_images')
                    .insert({
                        question_id: qData.id,
                        original_bin_id: img.binId,
                        format: img.format,
                        data: img.data,
                        size_bytes: img.sizeBytes
                    });

                if (imgError) {
                    console.error(`[HML-V2-INGEST] Image ${binId} insert error:`, imgError);
                }
            }

            console.log(`[HML-V2-INGEST] Q${q.questionNumber} saved with ${q.imageRefs.length} images`);
        }

        console.log(`[HML-V2-INGEST] Complete: ${savedQuestionIds.length}/${questions.length} questions saved`);

        return NextResponse.json({
            success: true,
            fileId,
            questionCount: savedQuestionIds.length,
            imageCount: images.length,
            questionIds: savedQuestionIds
        });

    } catch (e: any) {
        console.error('[HML-V2-INGEST] Error:', e);
        return NextResponse.json({
            success: false,
            error: e.message || String(e)
        }, { status: 500 });
    }
}
