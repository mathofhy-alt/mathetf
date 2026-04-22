import { createClient } from '@supabase/supabase-js'; 
import * as dotenv from 'dotenv'; 
dotenv.config({ path: '.env.local' }); 
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); 

async function check() { 
    // Check if user_profiles exists and what columns it has
    const { data: users, error: err1 } = await supabase.from('users').select('*').limit(1); 
    if(!err1) console.log('users schema:', Object.keys(users[0] || {}));

    const { data: user_profiles, error: err2 } = await supabase.from('user_profiles').select('*').limit(1); 
    if(!err2) console.log('user_profiles schema:', Object.keys(user_profiles[0] || {}));

    const { data: profiles, error: err3 } = await supabase.from('profiles').select('*').limit(1);
    if(!err3) console.log('profiles schema:', Object.keys(profiles[0] || {}));
} 
check();
