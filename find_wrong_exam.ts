import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkExams() {
    console.log('Fetching recent 10 exam materials...');
    
    const { data: materials, error } = await supabase
        .from('exam_materials')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!materials) {
        console.log('Data is null');
        return;
    }

    console.log(`Found ${materials.length} exams. Details:`);
    for (const m of materials) {
        console.log(`- ID: ${m.id}`);
        console.log(`  Title: ${m.title}`);
        console.log(`  School: ${m.school}`);
        console.log(`  Year: ${m.year}, Grade: ${m.grade}, Semester: ${m.semester}, ContentType: ${m.content_type}`);
    }
}

checkExams();
