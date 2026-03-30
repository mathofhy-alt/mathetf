const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function test() {
    const { data, error } = await supabase.from('exam_materials').select('school, exam_year, grade, semester, exam_type, title').eq('school', '전국연합').limit(5);
    if(error) console.error(error);
    else console.log(data);
}
test();
