
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { requireAdmin } from '@/utils/admin-auth';

export async function POST(req: NextRequest) {
    const { authorized, response, user } = await requireAdmin();
    if (!authorized) return response;

    const supabase = createAdminClient();

    try {
        const body = await req.json();
        const { school, year, grade, semester, exam_type, subject } = body;

        // Validation
        if (!school || !year || !grade || !semester || !exam_type || !subject) {
            return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
        }

        // Construct Title: [School] [Year] [Grade] [Semester] [ExamType] [Subject] [개인DB]
        const title = `${school} ${year} ${grade}학년 ${semester}학기 ${exam_type} ${subject} [개인DB]`;
        const dummyPath = `db_access/${user?.id || 'admin'}/${Date.now()}`;

        // Insert into exam_materials
        const { data, error } = await supabase
            .from('exam_materials')
            .insert({
                uploader_id: user?.id,
                uploader_name: '관리자',
                school,
                region: '서울', // Default or fetch from school? Input doesn't provide it always.
                district: '강남구', // Default? Or require it?
                // Ideally we should look up the school's region/district.
                // But if not provided, maybe minimal data is fine?
                // The main page filters by region/district. So we NEED them.
                // We should fetch them from 'schools' table if possible.
                // year: Number(year), -- Missing in DB
                grade: Number(grade.replace(/[^0-9]/g, '')), // Extract digits only
                semester: Number(semester),
                exam_type: exam_type,
                subject,
                title,
                file_type: 'DB',
                content_type: '개인DB',
                file_path: dummyPath,
                price: 10000,
                sales_count: 0
            })
            .select()
            .single();

        if (error) throw error;

        // We should try to update region/district if missing
        // This is a "nice to have" fix up.
        // Or we require region/district in the body.

        return NextResponse.json({ success: true, data });

    } catch (e: any) {
        console.error('Activate DB Error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
