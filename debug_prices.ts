import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkQuestionCounts() {
    const schools = [
        { name: '은광여자고등학교', year: '2025', grade: '고1', semester: '1학기중간', subject: '공통수학1' },
        { name: '경기여자고등학교', year: '2025', grade: '고1', semester: '1학기중간', subject: '공통수학1' },
        { name: '경기여자고등학교', year: '2025', grade: '고1', semester: '2학기기말', subject: '공통수학2' },
        { name: '숙명여자고등학교', year: '2025', grade: '고1', semester: '1학기중간', subject: '공통수학1' },
        { name: '영동일고등학교', year: '2025', grade: '고1', semester: '2학기기말', subject: '공통수학2' },
        { name: '중앙대학교사범대학부속고등학교', year: '2025', grade: '고1', semester: '1학기중간', subject: '공통수학1' }
    ];

    for (const s of schools) {
        console.log(`\n--- Checking: ${s.name} ${s.year} ${s.grade} ${s.semester} ${s.subject} ---`);

        // Match logic from route.ts
        const { data: questions, error } = await supabase
            .from('questions')
            .select('id, difficulty, school, grade, semester')
            .ilike('school', `%${s.name}%`)
            .eq('year', s.year)
            .eq('grade', s.grade)
            .eq('semester', s.semester)
            .eq('subject', s.subject);

        if (error) {
            console.error('Error:', error);
            continue;
        }

        console.log(`Questions found: ${questions?.length || 0}`);
        if (questions && questions.length > 0) {
            let price = 0;
            questions.forEach(q => {
                const diff = parseInt(String(q.difficulty)) || 1;
                if (diff <= 2) price += 1000;
                else if (diff <= 4) price += 2000;
                else if (diff <= 6) price += 3000;
                else if (diff <= 8) price += 4000;
                else price += 5000;
            });
            console.log(`Calculated Price: ${price}P`);

            // Sample question difficulty
            console.log(`Sample difficulty: ${questions[0].difficulty}`);
        } else {
            console.log('No questions found with exact filters. Trying relaxed filters...');
            // Relaxed check
            const { data: relaxed } = await supabase
                .from('questions')
                .select('id, school, grade, semester')
                .ilike('school', `%${s.name}%`)
                .eq('year', s.year);
            console.log(`Relaxed match count (school name + year only): ${relaxed?.length || 0}`);
            if (relaxed && relaxed.length > 0) {
                console.log(`Sample from relaxed matches: School: ${relaxed[0].school} | Grade: ${relaxed[0].grade} | Semester: ${relaxed[0].semester}`);
            }
        }
    }
}

checkQuestionCounts();
