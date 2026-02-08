import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://eupclfzfouxzzmipjchz.supabase.co';
const supabaseKey = 'sb_publishable_3n7jaw_mi3SM56ces7Pylg_ujPC_KLP';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    const { data, error } = await supabase
        .from('questions')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('Column names:', Object.keys(data[0]));
    } else {
        console.log('No data found in questions table.');
    }
}

checkSchema();
