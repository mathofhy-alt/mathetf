
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Manually parse .env.local because dotenv might not be installed
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig: any = {};

if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
            envConfig[key] = value;
        }
    });
}

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = envConfig.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('--- Database Connection Diagnostic ---');
console.log(`URL: ${supabaseUrl}`);
console.log(`Anon Key Present: ${!!supabaseKey}`);
console.log(`Service Key Present: ${!!supabaseServiceKey}`);

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('CRITICAL: Missing Environment Variables (URL or SERVICE_ROLE_KEY)');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchema() {
    console.log('\n[Step 1] Attempting to select columns from "questions" table...');

    // Attempt to select a single row with * to see keys
    const { data, error } = await supabase
        .from('questions')
        .select('*')
        .limit(1);

    if (error) {
        console.error('ERROR Querying Table:', error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.warn('Table is empty, cannot inspect row keys directly via select.');
        console.log('Attempting to insert a dummy row to test schema...');
        // We can't really "check" schema easily without data or admin API.
        // But we can try to INSERT with the new columns and see if it fails.
    } else {
        const firstRow = data[0];
        console.log('Existing Columns detected in first row:', Object.keys(firstRow).join(', '));

        const hasRegion = 'region' in firstRow;
        const hasDistrict = 'district' in firstRow;

        console.log(`\nHas 'region' column? ${hasRegion ? 'YES ✅' : 'NO ❌'}`);
        console.log(`Has 'district' column? ${hasDistrict ? 'YES ✅' : 'NO ❌'}`);
    }

    // Step 2: Try an explicit INSERT with new columns to test "Schema Cache" error
    console.log('\n[Step 2] Testing INSERT with new columns...');
    const testRow = {
        question_number: -999, // Dummy ID
        plain_text: 'SCHEMA_TEST_ROW',
        region: 'TestRegion',
        district: 'TestDistrict',
        grade: 'TestGrade',
        school: 'TestSchool',
        subject: 'TestSubject',
        source_db_id: 'SCHEMA_TEST'
    };

    const insertRes = await supabase.from('questions').insert(testRow).select();

    if (insertRes.error) {
        console.error('❌ INSERT FAILED:', insertRes.error.message);
        console.log('Error Details:', insertRes.error.details);
        console.log('Error Hint:', insertRes.error.hint);
    } else {
        console.log('✅ INSERT SUCCESS! The columns definitely exist and are writable.');
        // Clean up
        await supabase.from('questions').delete().eq('question_number', -999);
        console.log('Dummy row cleaned up.');
    }
}

checkSchema();
