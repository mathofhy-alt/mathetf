const { createClient } = require('@supabase/supabase-js');
// require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchools() {
    // Count total rows
    const { count, error: countError } = await supabase
        .from('schools')
        .select('*', { count: 'exact', head: true });

    if (countError) {
        console.error('Error counting:', countError);
        return;
    }
    console.log('Total schools:', count);

    // List distinct regions (fetching all to do manual distinct since .distinct() is tricky with simple client)
    // Fetching 3000 rows to cover all
    const { data, error } = await supabase
        .from('schools')
        .select('region')
        .range(0, 2999);

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    const regions = new Set(data.map(d => d.region));
    console.log('Regions found:', Array.from(regions).sort());
}

checkSchools();
