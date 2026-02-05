
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables manually
const envPath = path.resolve(process.cwd(), '.env.local');
const envVars: Record<string, string> = {};
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
        const [key, val] = line.split('=');
        if (key && val) envVars[key.trim()] = val.trim();
    });
}

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectKyunggi() {
    console.log('Searching for Kyunggi Girls High School questions...');

    // Search for school name containing '경기'
    const { data, error } = await supabase
        .from('questions')
        .select('id, school, question_number, content_xml')
        .ilike('school', '%경기%')
        .limit(5);

    if (error) {
        console.error(error);
    } else {
        if (data && data.length > 0) {
            console.log(`ID: ${data[0].id}, Num: ${data[0].question_number}`);
            console.log("--- Content XML ---");
            console.log(data[0].content_xml.substring(0, 2000));
            console.log("-------------------");
        } else {
            console.log("No questions found for Kyunggi Girls High School.");
        }
    }
}

inspectKyunggi();
