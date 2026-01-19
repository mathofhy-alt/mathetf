import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { HwpxMerger } from '@/lib/hwpx-merger';

export async function POST(req: NextRequest) {
  try {
    const { questionIds } = await req.json();

    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      return NextResponse.json({ error: 'No questions selected' }, { status: 400 });
    }

    const supabase = createClient();

    // Fetch actual question content
    const { data: questions, error } = await supabase
      .from('questions')
      .select('id, content_xml')
      .in('id', questionIds);

    if (error || !questions) {
      throw new Error('Failed to fetch questions from DB');
    }

    // Use the centralized, strict HwpxMerger
    const path = require('path');
    const templatePath = path.join(process.cwd(), 'standard_template.hwpx');
    const outputFilename = `exam_${Date.now()}.hwpx`;
    const hwpxBuffer = await HwpxMerger.merge(templatePath, outputFilename, questions);

    // Return as Download
    return new NextResponse(Buffer.from(hwpxBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.hancom.hwpx+zip', // Match the mimetype
        'Content-Disposition': `attachment; filename="exam.hwpx"`,
      },
    });

  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
