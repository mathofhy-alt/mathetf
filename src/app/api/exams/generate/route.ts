
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient as createClient } from '@/utils/supabase/server-admin';
import { HwpxMerger } from '@/lib/hwpx/merger';
import path from 'path';

export async function POST(req: NextRequest) {
    try {
        const { questionIds } = await req.json();

        if (!questionIds || !Array.isArray(questionIds)) {
            return NextResponse.json({ error: 'Invalid questionIds' }, { status: 400 });
        }

        const supabase = createClient();

        // 1. Fetch Question Metadata with File Info
        // We need: file_id, start_pos, end_pos, original_name
        const { data: questions, error } = await supabase
            .from('questions')
            .select(`
                id,
                file_id,
                start_pos,
                end_pos,
                files (original_name)
            `)
            .in('id', questionIds)
            .order('question_index', { ascending: true }); // Maintain input order or index order? Usually input order matters for exams.
        // If user selected arbitrary questions, we should respect the order in `questionIds`.
        // But SQL `in` doesn't guarantee order. We should sort in memory.

        if (error || !questions) {
            throw new Error('Failed to fetch questions');
        }

        // Sort questions based on input `questionIds` order
        const orderedQuestions = questionIds.map((id: string) => questions.find((q: any) => q.id === id)).filter(Boolean);

        // 2. Map to Source Objects
        const sources = orderedQuestions.map((q: any) => ({
            file_id: q.file_id,
            start_pos: q.start_pos,
            end_pos: q.end_pos,
            original_name: q.files?.original_name || 'unknown'
        }));

        // 3. Execute Merge
        const templatePath = path.join(process.cwd(), 'standard_template.hwpx');
        const outputName = `exam_${Date.now()}.hwpx`;

        const examBuffer = await HwpxMerger.merge({
            templatePath,
            outputFilename: outputName,
            sources: sources.map((s, idx) => ({
                ...s,
                id: questionIds[idx], // or some unique id
                path: `raw_uploads/${s.file_id}.hwpx`
            })),
            bucket: 'hwpx'
        });

        // 4. Return Download
        // Cast buffer to any or use explicit Response constructor if NextResponse complains about Buffer type
        return new NextResponse(examBuffer as any, {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${outputName}"`
            }
        });

    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
