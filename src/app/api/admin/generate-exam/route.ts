
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
            .select('id, content_xml')
            .in('id', questionIds)
            .order('id'); // Or preserve selection order if provided?

        if (error) {
            console.error('[API] DB Fetch Error:', error);
            throw error;
        }

        console.log(`[API] DB Fetched ${questions?.length ?? 0} questions.`);

        if (!questions || questions.length === 0) {
            console.error('[API] No questions found in DB for given IDs');
            return NextResponse.json({ error: 'Questions not found' }, { status: 404 });
        }

        // Checking content of first question to ensure it's not empty
        if (questions.length > 0) {
            console.log(`[API] Sample Content (Q1):`, questions[0].content_xml?.substring(0, 100) + '...');
        }

        // 2. Merge into HWPX
        // Note: This is an expensive operation. In production, this might move to a background job.
        const hwpxBuffer = await HwpxMerger.merge(questions);
        console.log(`[API] HWPX Buffer created. Size: ${hwpxBuffer.byteLength} bytes.`);

        // 3. Return File
        // We return as a specific content type so the browser triggers download
        return new NextResponse(Buffer.from(hwpxBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/hwp+zip',
                'Content-Disposition': `attachment; filename="exam.hwpx"`,
            }
        });

    } catch (e: any) {
        console.error('[API] Generate Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
