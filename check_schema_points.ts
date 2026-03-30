import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: cols1 } = await supabase.rpc('debug_get_columns', { table_name: 'exam_materials' });
    const { data: cols2 } = await supabase.rpc('debug_get_columns', { table_name: 'purchases' });
    const { data: cols3 } = await supabase.rpc('debug_get_columns', { table_name: 'profiles' });
    const { data: cols4 } = await supabase.rpc('debug_get_columns', { table_name: 'point_logs' });

    console.log('exam_materials:', cols1 || 'No RPC access, fetching one row instead');
    
    if (!cols1) {
        const { data: r1 } = await supabase.from('exam_materials').select('*').limit(1);
        console.log('exam_materials sample:', Object.keys(r1?.[0] || {}));
        const { data: r2 } = await supabase.from('purchases').select('*').limit(1);
        console.log('purchases sample:', Object.keys(r2?.[0] || {}));
        const { data: r3 } = await supabase.from('profiles').select('*').limit(1);
        console.log('profiles sample:', Object.keys(r3?.[0] || {}));
        const { data: r4 } = await supabase.from('point_logs').select('*').limit(1);
        console.log('point_logs sample:', Object.keys(r4?.[0] || {}));
    }
}
check();
