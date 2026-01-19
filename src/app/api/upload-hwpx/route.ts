import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient as createClient } from '@/utils/supabase/server-admin';
import { parseQuestionsFromHwpx } from '@/lib/hwpx/parser';

const STORAGE_BUCKET = 'hwpx';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        // --- ENV & CONFIG LOGGING ---
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const host = supabaseUrl ? new URL(supabaseUrl).hostname : 'UNDEFINED';
        console.log(`[INGEST-INIT] Target Supabase Host: ${host}`);
        console.log(`[INGEST-INIT] Target Bucket: ${STORAGE_BUCKET}`);

        if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return NextResponse.json({ error: 'Server Misconfiguration: Missing SUPABASE_URL or SERVICE_ROLE_KEY' }, { status: 500 });
        }
        // ----------------------------

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const supabase = createClient();
        const buffer = Buffer.from(await file.arrayBuffer());

        // 1. Validate Extension
        const isHwpx = file.name.toLowerCase().endsWith('.hwpx');
        if (!isHwpx) {
            return NextResponse.json({ error: 'Only .hwpx files are allowed' }, { status: 400 });
        }

        // --- PRE-FLIGHT BUCKET CHECK & AUTO-CREATE ---
        const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
        if (listErr) {
            console.error('[INGEST-ERR] Failed to list buckets:', listErr);
            throw new Error(`Supabase Connection Failed: ${listErr.message}`);
        }

        const bucketExists = buckets?.find(b => b.name === STORAGE_BUCKET);
        if (!bucketExists) {
            console.log(`[INGEST] Bucket '${STORAGE_BUCKET}' not found. Attempting Auto-Creation...`);
            const { error: createErr } = await supabase.storage.createBucket(STORAGE_BUCKET, {
                public: true,
                fileSizeLimit: 52428800 // 50MB
            });

            if (createErr) {
                console.warn(`[INGEST-WARN] Auto-creation returned error (ignoring and trying upload):`, createErr.message);
                // We PROCEED anyway. If the bucket really doesn't exist, the upload step below will fail.
            } else {
                console.log(`[INGEST] Bucket '${STORAGE_BUCKET}' created successfully.`);
            }
        }
        // ----------------------------------------------

        // 2. Upload raw HWPX to Storage
        // Path: raw_uploads/{uuid}.hwpx
        const fileId = crypto.randomUUID();
        const storagePath = `raw_uploads/${fileId}.hwpx`;
        const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, buffer, { contentType: 'application/zip' });

        if (uploadError) {
            console.error('Storage Upload Error:', uploadError);
            throw new Error('Failed to upload HWPX to storage');
        }

        // 3. Insert into 'files' table
        const { error: fileDbError } = await supabase
            .from('files')
            .insert({
                id: fileId,
                original_name: file.name,
                storage_path: storagePath
            });

        if (fileDbError) {
            console.error('Files Table Insert Error:', fileDbError);
            throw new Error('Failed to record file metadata');
        }

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
        const { boundaries, sectionLength } = await parseQuestionsFromHwpx(buffer);
        const savedIds = [];

        // --- INGESTION LOGGING & VALIDATION ---
        console.log(`[INGEST] File ID: ${fileId}`);
        console.log(`[INGEST] Original Name: ${file.name}`);
        console.log(`[INGEST] Storage Path: ${storagePath} (Length: ${buffer.length} bytes)`);
        console.log(`[INGEST] Section Length: ${sectionLength} nodes`);
        console.log(`[INGEST] Questions Detected: ${boundaries.length}`);

        // Sample Log First 3
        boundaries.slice(0, 3).forEach((b, idx) => {
            console.log(`[INGEST] Question[${idx + 1}]: Index ${b.questionIndex}, Range [${b.startPos} - ${b.endPos}]`);
            // Strict Validation
            if (b.startPos < 0 || b.endPos < 0) console.error(`[CRITICAL] Negative Boundary Detected at Q${b.questionIndex}`);
            if (b.startPos > b.endPos) console.error(`[CRITICAL] Inverted Boundary Detected at Q${b.questionIndex}`);
            if (b.endPos >= sectionLength) console.error(`[CRITICAL] Out of Bounds Detected at Q${b.questionIndex} (End ${b.endPos} >= Len ${sectionLength})`);
        });
        // ---------------------------------------

        // 5. Insert into 'questions' table
        for (const b of boundaries) {
            const { data, error } = await supabase
                .from('questions')
                .insert({
                    file_id: fileId,
                    question_index: b.questionIndex,
                    start_pos: b.startPos,
                    end_pos: b.endPos,
                    // file_name removed
                    fragment_xml: b.xml, // NEW
                    fragment_len: b.xml.length, // NEW
                    title: `${file.name.replace('.hwpx', '')} - Q${b.questionIndex}`,
                    content_xml: '', // No longer used for generation
                    is_active: true,
                    school_names: [],
                    year: new Date().getFullYear().toString()
                })
                .select('id')
                .single();

            if (b.questionIndex < 3) console.log(`[INGEST] sample q${b.questionIndex - 1} fragLen=${b.xml.length}`);

            if (error) {
                console.error(`Question Insert Error (Index ${b.questionIndex}):`, error);
            } else if (data) {
                savedIds.push(data.id);
            }
        }

        return NextResponse.json({
            success: true,
            count: savedIds.length,
            ids: savedIds,
            logs: [`Ingested ${savedIds.length} questions from ${file.name}`]
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
