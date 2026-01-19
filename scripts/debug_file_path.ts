
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkFiles() {
    const { data, error } = await supabase
        .from('exam_materials')
        .select('id, title, school, file_path, file_type, created_at')
        .ilike('school', '%영동일고%');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Found files:', data);
}

checkFiles();
