
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load env validation
const envPath = path.resolve(process.cwd(), '.env.local');
const envVars: Record<string, string> = {};
if (fs.existsSync(envPath)) {
    console.log('Loading .env.local...');
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
        const [key, ...rest] = line.split('=');
        if (key && rest.length > 0) {
            envVars[key.trim()] = rest.join('=').trim();
        }
    });
}

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY']; // or SERVICE_ROLE if needed, but ANON should see public columns

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Fetching one record from exam_materials...');
    const { data, error } = await supabase
        .from('exam_materials')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('No data found in exam_materials. Cannot determine columns from data.');
        // Try inserting a dummy to see error? No, that's risky.
    } else {
        console.log('Columns found:', Object.keys(data[0]));
    }
}

checkSchema();
