import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://eupclfzfouxzzmipjchz.supabase.co';
const supabaseKey = 'sb_publishable_3n7jaw_mi3SM56ces7Pylg_ujPC_KLP';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    const { data, error } = await supabase
        .from('questions')
        .select('key_concepts')
        .not('key_concepts', 'is', null)
        .limit(5);

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    console.log('Sample key_concepts data:', data);
}

checkData();
