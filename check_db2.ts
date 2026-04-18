import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function check() {
    const { data } = await supabase.from('questions').select('school, year, grade, semester, subject').ilike('semester', '%수능%').limit(5);
    console.log(data);
}
check();
