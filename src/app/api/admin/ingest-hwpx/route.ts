import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { parseQuestionsFromHwpx } from '@/lib/hwpx/parser';
import { renderMathToSvg } from '@/lib/math-renderer';

const STORAGE_BUCKET = 'hwpx';

import { requireAdmin } from '@/utils/admin-auth';

export async function POST(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        // --- ENV & CONFIG LOGGING ---
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const host = supabaseUrl ? new URL(supabaseUrl).hostname : 'UNDEFINED';
        console.log(`[ADMIN-INGEST] Target Supabase Host: ${host}`);
        console.log(`[ADMIN-INGEST] Target Bucket: ${STORAGE_BUCKET}`);
        // ----------------------------

        // Metadata
        const school = formData.get('school') as string || '';
        const region = formData.get('region') as string || '';
        const district = formData.get('district') as string || '';
        const year = formData.get('year') as string || '';
        const semester = formData.get('semester') as string || '';
        const subject = formData.get('subject') as string || '';
        const grade = formData.get('grade') as string || '';
        // unit and difficulty are typically per-question but here applied to batch?
        // or effectively metadata for the whole file? Older logic applied them to all.

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
        }

        const supabase = createClient();
        const buffer = Buffer.from(await file.arrayBuffer());

        // 1. Validate Extension (Admin might upload HML too? User instructions focused on HWPX only for now)
        // User said: "업로드는 .hwpx만 허용 (HML 차단)" in Step 1611.
        // So strict HWPX.

        if (!file.name.toLowerCase().endsWith('.hwpx')) {
            return NextResponse.json({ success: false, error: 'Only .hwpx allowed' }, { status: 400 });
        }


        // --- PRE-FLIGHT BUCKET CHECK & AUTO-CREATE ---
        const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
        if (listErr) {
            console.error('[ADMIN-INGEST-ERR] Failed to list buckets:', listErr);
            throw new Error(`Supabase Connection Failed: ${listErr.message}`);
        }

        const bucketExists = buckets?.find(b => b.name === STORAGE_BUCKET);
        if (!bucketExists) {
            console.log(`[ADMIN-INGEST] Bucket '${STORAGE_BUCKET}' not found. Attempting Auto-Creation...`);
            const { error: createErr } = await supabase.storage.createBucket(STORAGE_BUCKET, {
                public: true,
                fileSizeLimit: 52428800 // 50MB
            });

            if (createErr) {
                console.warn(`[ADMIN-INGEST-WARN] Auto-creation returned error (ignoring and trying upload):`, createErr.message);
            } else {
                console.log(`[ADMIN-INGEST] Bucket '${STORAGE_BUCKET}' created successfully.`);
            }
        }
        // ----------------------------------------------

        // 2. Upload raw HWPX to Storage
        const fileId = crypto.randomUUID();
        const storagePath = `raw_uploads/${fileId}.hwpx`;
        const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, buffer, { contentType: 'application/zip' });

        if (uploadError) throw new Error('Failed to upload HWPX to storage: ' + uploadError.message);

        // 3. Insert into 'files' table
        const { error: fileDbError } = await supabase
            .from('files')
            .insert({
                id: fileId,
                original_name: file.name,
                storage_path: storagePath
            });

        if (fileDbError) throw new Error('Failed to record file metadata: ' + fileDbError.message);

        // Verification Log [INGEST_OK]
        const { data: verifyData } = await supabase.storage.from(STORAGE_BUCKET).list('raw_uploads', {
            search: `${fileId}.hwpx`
        });
        const exists = (verifyData && verifyData.length > 0) ? true : false;

        console.log(`[INGEST_OK]`);
        console.log(`file_id=${fileId}`);
        console.log(`storage_path=${storagePath}`);
        console.log(`exists=${exists}`);
        console.log(`bytes=${buffer.length}`);

        if (!exists) throw new Error(`CRITICAL: Uploaded file missing from storage immediately after upload! path=${storagePath}`);

        // 4. Parse Boundaries
        // USE NEW SINGLETON PARSER
        const { boundaries, sectionLength } = await parseQuestionsFromHwpx(buffer);

        // --- INGESTION LOGGING ---
        console.log(`[ADMIN-INGEST] File ID: ${fileId}`);
        console.log(`[ADMIN-INGEST] Section Length: ${sectionLength}`);
        console.log(`[ADMIN-INGEST] Questions Detected: ${boundaries.length}`);

        const source_db_id = `${school}_${year}_${semester}_${subject}`;
        const savedIds = [];

        // 5. Insert questions
        for (const b of boundaries) {
            const { data, error } = await supabase.from('questions')
                .insert({
                    file_id: fileId,
                    question_index: b.questionIndex,
                    start_pos: b.startPos,
                    end_pos: b.endPos,
                    // file_name removed due to schema mismatch

                    fragment_xml: b.xml,
                    fragment_len: b.xml.length,

                    // FIX: Populate 'content_xml' to satisfy NOT NULL constraint (legacy column?)
                    content_xml: b.xml,

                    // Metadata map
                    subject,
                    region,
                    district,
                    school,
                    grade,
                    year,
                    semester,
                    source_db_id,
                    question_number: b.questionIndex,
                    equation_scripts: b.equationScripts
                })
                .select('id')
                .single();

            // LOGGING: Fragment Validation (User Requested)
            if (b.questionIndex < 3) {
                console.log(`[ADMIN-INGEST] sample q${b.questionIndex - 1} fragLen=${b.xml.length}`);
            }
            if (b.xml.length <= 0) {
                console.error(`[ADMIN-INGEST-CRITICAL] Q${b.questionIndex} has Zero/Negative length!`);
            }

            if (error) {
                console.error(`[ADMIN-INGEST] Insert Error Q${b.questionIndex}:`, error);
            } else {
                savedIds.push(data.id);

                // 6. Pre-render Math Images (V28)
                if (b.equationScripts && b.equationScripts.length > 0) {
                    for (let i = 0; i < b.equationScripts.length; i++) {
                        const script = b.equationScripts[i];
                        try {
                            // Call V28 Engine (Python Proxy)
                            const svg = await renderMathToSvg(script);
                            const binId = `MATH_${i}`;
                            const b64Data = Buffer.from(svg).toString('base64');

                            await supabase.from('question_images')
                                .insert({
                                    question_id: data.id,
                                    original_bin_id: binId,
                                    format: 'svg',
                                    data: b64Data,
                                    size_bytes: svg.length
                                });
                        } catch (renderError) {
                            console.error(`[ADMIN-INGEST-MATH-ERR] Q${data.id} M${i}:`, renderError);
                        }
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            questionCount: savedIds.length,
            debug: { firstQ: "Content Hidden (HWPX Source)" }
        });

    } catch (e: any) {
        console.error('Ingest Error:', e);
        return NextResponse.json({ success: false, error: e.message || String(e) }, { status: 500 });
    }
}
