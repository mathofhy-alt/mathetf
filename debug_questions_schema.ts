
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load env validation
const envPath = path.resolve(process.cwd(), '.env.local');
const envVars: Record<string, string> = {};
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
        const [key, ...rest] = line.split('=');
        if (key && rest.length > 0) {
            envVars[key.trim()] = rest.join('=').trim();
        }
    });
}

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkQuestionsSchema() {
    console.log('Fetching one record from questions...');
    const { data, error } = await supabase
        .from('questions')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching questions:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('No data found in questions.');
    } else {
        console.log('Columns found in questions:', Object.keys(data[0]));
    }
}

checkQuestionsSchema();
