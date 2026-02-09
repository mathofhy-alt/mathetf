
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { HwpxMerger } from '@/lib/hwpx/merger';

import { requireAdmin } from '@/utils/admin-auth';

export async function POST(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    try {
        const { questionIds } = await req.json();

        if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
            return NextResponse.json({ success: false, error: 'No question IDs provided' }, { status: 400 });
        }

        const supabase = createClient();

        // 1. Fetch Questions
        const { data: questions, error } = await supabase
            .from('questions')
            .select('id, file_id, content_xml')
            .in('id', questionIds)
            .order('id');

        if (error) {
            console.error('[API] DB Fetch Error:', error);
            throw error;
        }

        if (!questions || questions.length === 0) {
            return NextResponse.json({ error: 'Questions not found' }, { status: 404 });
        }

        // 2. Merge into HWPX
        const path = require('path');
        const hwpxBuffer = await HwpxMerger.merge({
            templatePath: path.join(process.cwd(), 'standard_template.hwpx'),
            outputFilename: 'exam.hwpx',
            sources: questions.map(q => ({
                id: q.id,
                file_id: q.file_id,
                path: `raw_uploads/${q.file_id}.hwpx`,
                content_xml: q.content_xml,
                original_name: 'question'
            })),
            bucket: 'hwpx'
        });

        console.log(`[API] HWPX Buffer created. Size: ${hwpxBuffer.byteLength} bytes.`);

        // 3. Return File
        return new NextResponse(hwpxBuffer as any, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.hancom.hwpx+zip',
                'Content-Disposition': `attachment; filename="exam.hwpx"`,
            }
        });

    } catch (e: any) {
        console.error('[API] Generate Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
