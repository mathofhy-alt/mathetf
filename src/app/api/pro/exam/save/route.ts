
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import fs from 'fs';
import path from 'path';

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

        // Fetch if IDs provided but no questions (or partial)
        if (ids && ids.length > 0 && questions.length === 0) {
            console.log('[SaveAPI] Fetching questions from DB...');
            const { data, error } = await supabase
                .from('questions')
                .select('*, question_images(*)') // Include images!
                .in('id', ids);

            if (error) {
                console.error('[SaveAPI] DB Fetch Error:', error);
                throw new Error("DB Error");
            }

            if (data) {
                console.log(`[SaveAPI] Fetched ${data.length} questions.`);
                // Correct ordering
                const qMap = new Map();
                data.forEach(q => qMap.set(q.id, q));
                ids.forEach((id: string) => {
                    const q = qMap.get(id);
                    if (q) questions.push(q);
                });
            }
        }

        if (questions.length === 0) return NextResponse.json({ success: false, error: 'No questions provided' }, { status: 400 });

        // Prepare Questions (same as download route)
        console.log('[SaveAPI] Preparing questions...');
        questions.forEach((q, idx) => {
            if (!q.content_xml || q.content_xml.trim().length === 0) {
                q.content_xml = `<P ParaShape="0" Style="0"><TEXT CharShape="0">[Error] Content Missing for Q${q.id}</TEXT></P>`;
            }
            q.question_number = idx + 1;
        });

        // Load Template
        console.log('[SaveAPI] Loading template...');
        let templatePath = path.join(process.cwd(), '재조립양식.hml');
        if (!fs.existsSync(templatePath)) {
            templatePath = path.join(process.cwd(), 'template.hml');
        }
        if (!fs.existsSync(templatePath)) throw new Error('Template file missing');

        const templateXml = fs.readFileSync(templatePath, 'utf-8');
        console.log('[SaveAPI] Template loaded.');

        // Generate HML
        console.log('[SaveAPI] Initializing HML Generator...');
        const { generateHmlFromTemplate } = await import('@/lib/hml-v2/generator');
        const questionsWithImages = questions.map(q => ({
            question: q,
            images: q.images || q.question_images || [] // Handle both formats
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
