require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) { throw new Error("Missing env vars"); }
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: dbs } = await supabase.from('exam_materials').select('*').eq('exam_type', '모의고사');
    console.log('--- Mock DBs ---');
    console.log(JSON.stringify(dbs, null, 2));

    const orStr = `and(school.eq.전국연합,grade.eq.고3,year.eq.2025,semester.in.("9월","9월 모의고사"),subject.in.("공통수학1","공통수학2","수학(상)","수학(하)","수학I","수학II","대수","미적분I","미적분1","공통","확률과통계"))`;
    console.log("Testing:", orStr);
    const { data: questions, error } = await supabase.from('questions').select('id, question_number, school, year, grade, semester, subject, unit, work_status').or(orStr);
    if(error) console.error(error);
    console.log('\n--- Questions ---', questions ? questions.length : 0);
    console.log('\n--- Questions ---');
    console.log(JSON.stringify(questions, null, 2));
}
run();
