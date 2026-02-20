import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);

    const school = searchParams.get('school');
    const year = searchParams.get('year');
    const grade = searchParams.get('grade');
    const semester = searchParams.get('semester'); // 1 or 2
    const examType = searchParams.get('examType'); // 중간고사 or 기말고사
    const subject = searchParams.get('subject');

    if (!school || !year || !grade || !semester || !examType) {
        return NextResponse.json({ success: false, error: 'Missing required parameters' }, { status: 400 });
    }

    // Reconstruct semester string: e.g. "1학기중간"
    const semType = examType.includes('중간') ? '중간' : '기말';
    const semesterStr = `${semester}학기${semType}`;

    // Construct Grade string: e.g. "고1"
    const gradeStr = grade.includes('고') ? grade : `고${grade}`;

    try {
        const { data, error } = await supabase
            .from('questions')
            .select('question_number, difficulty, unit')
            .ilike('school', `%${school}%`)
            .eq('year', year)
            .eq('grade', gradeStr)
            .eq('semester', semesterStr)
            .eq('subject', subject)
            .order('question_number', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (e: any) {
        console.error('Fetch DB Details Error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
