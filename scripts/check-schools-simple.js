const { createClient } = require('@supabase/supabase-js');
// require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    // Test 1: Default
    const { data: d1 } = await supabase.from('schools').select('id');
    console.log('Default fetch count:', d1.length);

    // Test 2: Range
    const { data: d2 } = await supabase.from('schools').select('id').range(0, 2999);
    console.log('Range(0, 2999) fetch count:', d2.length);
}

check();
