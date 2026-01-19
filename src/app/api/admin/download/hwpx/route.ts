
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { HwpxMerger } from '@/lib/hwpx/merger';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const supabase = createClient();

    // Auth Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new NextResponse('Unauthorized', { status: 401 });

    try {
        const body = await req.json();
        const questionIds: string[] = body.ids || [];
        console.log(`[REQ] questionIds=${JSON.stringify(questionIds)}`);

        // [DUPLICATE_ID_GATE]
        const uniqIds = Array.from(new Set(questionIds));
        if (uniqIds.length !== questionIds.length) {
            return NextResponse.json(
                { ok: false, stage: "validation", message: "DUPLICATE_SELECTION", detail: { raw: questionIds, uniq: uniqIds } },
                { status: 400 }
            );
        }
        const ids = uniqIds;

        let questions: any[] = [];

        if (ids.length > 0) {
            const { data: rows, error } = await supabase
                .from('questions')
                .select(`
                    id,
                    file_id,
                    fragment_xml,
                    content_xml,
                    question_index,
                    start_pos,
                    end_pos
                `)
                .in('id', ids);

            if (error) throw new Error("DB Error: " + error.message);
            if (rows) questions = rows;
        }

        if (questions.length === 0) return new NextResponse('No valid questions', { status: 400 });

        // (2) file_id 누락 방어
        const missing = questions.filter(r => !r.file_id).map(r => r.id);
        if (missing.length) {
            return NextResponse.json(
                { ok: false, stage: "validation", message: "MISSING_FILE_ID", detail: { missingIds: missing } },
                { status: 400 }
            );
        }

        // Map rows to a Map for O(1) lookup and order preservation
        const rowMap = new Map(questions.map(q => [q.id, q]));

        // (3) sources 생성: path는 raw_uploads/{file_id}.hwpx
        const mergeSources = ids.map((id, idx) => {
            const q = rowMap.get(id);
            if (!q) throw new Error(`MISSING_QUESTION_ROW:${id}`);

            const storagePath = `raw_uploads/${q.file_id}.hwpx`;

            return {
                id: q.id,
                file_id: q.file_id,
                path: storagePath,
                fragment_xml: q.fragment_xml ?? null,
                content_xml: q.content_xml ?? null,
                original_name: `q${idx}`,
                question_number: idx + 1,
                start_pos: q.start_pos,
                end_pos: q.end_pos
            };
        });

        console.log(`[SOURCES] ${mergeSources.map(s => `${s.id}=>${s.path}`).join(" | ")}`);

        // (4) Storage 존재 확인 (유니크한 소스만 체크)
        const uniquePaths = Array.from(new Set(mergeSources.map(s => s.path)));
        for (const storagePath of uniquePaths) {
            const { data: check, error: checkErr } = await supabase.storage
                .from('hwpx')
                .list('raw_uploads', { search: path.basename(storagePath) });

            if (checkErr || !check || check.length === 0) {
                return NextResponse.json(
                    { ok: false, stage: "pre-flight", message: "SOURCE_NOT_FOUND", detail: { path: storagePath } },
                    { status: 404 }
                );
            }
        }

        const count = ids.length;
        const requestedMirror = Boolean(body?.mirror || body?.MERGE_MIRROR);

        let isSingleTest = false;
        if (count === 1) {
            isSingleTest = true;
        }

        console.log(`[DOWNLOAD] Initiating HWPX Merge. SINGLE_TEST=${isSingleTest} MERGE_MIRROR=${requestedMirror}`);

        // Locate Template
        const templatePath = path.join(process.cwd(), 'public', 'template.hwpx');

        // (5) Execute Merge via Option Object
        const outputBuffer = await HwpxMerger.merge({
            templatePath,
            outputFilename: 'output.hwpx',
            sources: mergeSources as any,
            bucket: 'hwpx',
            isSingleTest,
            isMergeMirror: requestedMirror
        });

        const filename = `exam_${new Date().getTime()}.hwpx`;

        return new NextResponse(outputBuffer as any, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.hancom.hwpx',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': outputBuffer.length.toString(),
            },
        });

    } catch (e: any) {
        console.error('[DOWNLOAD_ERROR]', e);
        return NextResponse.json({
            ok: false,
            stage: "merge",
            message: e instanceof Error ? e.message : String(e)
        }, { status: 500 });
    }
}
