
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkMetadata() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

    // Fetch last 5 saved exams
    const { data, error } = await supabase
        .from('user_items')
        .select('id, name, created_at, metadata')
        .eq('type', 'saved_exam')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Recent Saved Exams Metadata:');
    data.forEach(item => {
        console.log(`[${item.name}] (${item.created_at})`);
        console.log('Metadata:', JSON.stringify(item.metadata, null, 2));
        console.log('-------------------');
    });
}

checkMetadata();
