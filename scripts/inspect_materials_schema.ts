
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Manually parse .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig: any = {};

if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, '');
            envConfig[key] = value;
        }
    });
}

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = envConfig.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('CRITICAL: Missing Environment Variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectSchema() {
    console.log('--- Inspecting exam_materials Schema ---');
    const { data, error } = await supabase
        .from('exam_materials')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    if (data && data.length > 0) {
        console.log('Columns:', Object.keys(data[0]).join(', '));
        console.log('First Row Data:', JSON.stringify(data[0], null, 2));
    } else {
        console.log('No data in exam_materials to inspect.');
    }
}

inspectSchema();
