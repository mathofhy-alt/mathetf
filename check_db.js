require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data } = await supabase.from('questions').select('content_xml').limit(1);
    console.log("=== DB content_xml ===");
    console.log(data[0].content_xml);
}
check();
