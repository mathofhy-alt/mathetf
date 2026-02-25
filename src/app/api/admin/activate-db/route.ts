
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
        // Normalize Grade: 1 -> "고1"
        let gradeVal = String(grade);
        if (['1', '2', '3'].includes(gradeVal.replace(/[^0-9]/g, ''))) {
            gradeVal = `고${gradeVal.replace(/[^0-9]/g, '')}`;
        }

        // Normalize Semester: 1 -> "1학기중간" or "1학기기말"
        const semNum = String(semester).replace(/[^0-9]/g, '');
        const typeShort = exam_type.includes('중간') ? '중간' : (exam_type.includes('기말') ? '기말' : '');
        const semesterVal = typeShort ? `${semNum}학기${typeShort}` : `${semNum}학기`;

        console.log(`Searching questions for: ${school} | ${year} | ${gradeVal} | ${semesterVal} | ${subject}`);

        let { data: questions, error: qError } = await supabase
            .from('questions')
            .select('difficulty')
            .ilike('school', `%${school}%`)
            .eq('year', String(year))
            .eq('grade', gradeVal)
            .eq('semester', semesterVal)
            .eq('subject', subject);

        // Try relaxed school matching if no questions found
        if (!questions || questions.length === 0) {
            console.log(`No questions found for "${school}". Trying relaxed sub-string match...`);
            const subSchool = school.length > 4 ? school.substring(0, 4) : school;
            const { data: relaxedQuestions, error: rError } = await supabase
                .from('questions')
                .select('difficulty')
                .ilike('school', `%${subSchool}%`)
                .eq('year', String(year))
                .eq('grade', gradeVal)
                .eq('semester', semesterVal)
                .eq('subject', subject);

            if (relaxedQuestions && relaxedQuestions.length > 0) {
                console.log(`Found ${relaxedQuestions.length} questions using relaxed match: %${subSchool}%`);
                questions = relaxedQuestions;
            } else {
                qError = qError || rError;
            }
        }

        if (qError) throw qError;

        let calculatedPrice = 0; // No Base Price
        if (questions && questions.length > 0) {
            console.log(`Found ${questions.length} questions. Calculating price...`);
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
            console.warn(`WARNING: Still no questions found for ${school}. Falling back to 20,000P.`);
            calculatedPrice = 20000;
        }

        // 2. Insert into exam_materials
        const { data, error } = await supabase
            .from('exam_materials')
            .insert({
                uploader_id: user?.id,
                uploader_name: user?.email?.split('@')[0] || '관리자',
                school,
                region: '서울', // Default
                district: '강남구', // Default
                grade: Number(String(grade).replace(/[^0-9]/g, '')),
                semester: Number(String(semester).replace(/[^0-9]/g, '')) || 1, // Fallback if string
                exam_type: exam_type,
                subject,
                title,
                exam_year: Number(year),
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
