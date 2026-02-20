
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

        // 1. Calculate price based on question difficulties
        // Search criteria for questions belonging to this exam
        const { data: questions, error: qError } = await supabase
            .from('questions')
            .select('difficulty')
            .ilike('school', `%${school}%`)
            .eq('year', year)
            .eq('grade', grade)
            .eq('semester', semester)
            .eq('subject', subject);

        if (qError) throw qError;

        let calculatedPrice = 0; // No Base Price
        if (questions && questions.length > 0) {
            questions.forEach(q => {
                const diff = parseInt(String(q.difficulty)) || 1;
                if (diff <= 2) calculatedPrice += 1000;
                else if (diff <= 4) calculatedPrice += 2000;
                else if (diff <= 6) calculatedPrice += 3000;
                else if (diff <= 8) calculatedPrice += 4000;
                else calculatedPrice += 5000;
            });
        } else {
            // Fallback if no questions found
            calculatedPrice = 20000;
        }

        // 2. Insert into exam_materials
        const { data, error } = await supabase
            .from('exam_materials')
            .insert({
                uploader_id: user?.id,
                uploader_name: '관리자',
                school,
                region: '서울', // Default
                district: '강남구', // Default
                grade: Number(String(grade).replace(/[^0-9]/g, '')),
                semester: Number(String(semester).replace(/[^0-9]/g, '')) || 1, // Fallback if string
                exam_type: exam_type,
                subject,
                title,
                file_type: 'DB',
                content_type: '개인DB',
                file_path: dummyPath,
                price: calculatedPrice,
                sales_count: 0
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data, calculated_price: calculatedPrice });

    } catch (e: any) {
        console.error('Activate DB Error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
