
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env.local');
const envVars: Record<string, string> = {};
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
        const [key, val] = line.split('=');
        if (key && val) envVars[key.trim()] = val.trim();
    });
}

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseServiceKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

async function testUpdate() {
    const testId = '2ef8718b-f8f5-46d4-991d-77a8c824f3a8';
    console.log(`Testing update for ID: ${testId}`);

    const { data, error } = await supabase
        .from('questions')
        .update({ difficulty: '3' })
        .eq('id', testId)
        .select();

    if (error) {
        console.error('Update failed:', error);
    } else {
        console.log('Update successful:', data);
    }
}

testUpdate();
