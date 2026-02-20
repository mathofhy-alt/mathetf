const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
    console.log('Checking exam_materials for 경기여고 2025...');
    const { data, error } = await supabase
        .from('exam_materials')
        .select('id, title, school, subject, exam_year, semester, exam_type')
        .ilike('title', '%경기여%')
        .ilike('title', '%2025%');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Results:', JSON.stringify(data, null, 2));
}

check();
