require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
    const { data, error } = await supabase
        .from('questions')
        .select('id, subject, school, grade, year, semester, work_status')
        .or('work_status.neq.sorted,work_status.is.null')
        .limit(20);

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`총 ${data.length}개의 미분류 문제 찾음:`);
    data.forEach((q, i) => {
        console.log(`[${i+1}] ID: ${q.id} | 과목: ${q.subject} | 학교: ${q.school} | 학년: ${q.grade} | ${q.year} ${q.semester}`);
    });
}

check();
