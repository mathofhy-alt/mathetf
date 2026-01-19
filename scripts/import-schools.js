const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env.local manually
const envPath = path.join(__dirname, '../.env.local');
const envConfig = fs.readFileSync(envPath, 'utf8');
const env = {};
envConfig.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length === 2) {
        env[parts[0].trim()] = parts[1].trim();
    }
});

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_KEY = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']; // Using ANON KEY. Ensure RLS is handled or table allows insert.

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const EXCEL_PATH = path.join(__dirname, '../학교목록.xlsx');

async function importSchools() {
    try {
        console.log('Reading Excel file...');
        const workbook = XLSX.readFile(EXCEL_PATH);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        // Skip header
        const dataRows = rows.slice(1);
        console.log(`Found ${dataRows.length} rows.`);

        const schoolData = [];
        dataRows.forEach(row => {
            const region = row[0];
            const district = row[1];
            const name = row[2];

            if (region && district && name) {
                schoolData.push({
                    region: region.toString().trim(),
                    district: district.toString().trim(),
                    name: name.toString().trim()
                });
            }
        });

        console.log(`Prepared ${schoolData.length} records to insert.`);

        // Insert in batches of 100 to avoid limits
        const batchSize = 100;
        for (let i = 0; i < schoolData.length; i += batchSize) {
            const batch = schoolData.slice(i, i + batchSize);
            const { error } = await supabase.from('schools').insert(batch);

            if (error) {
                console.error(`Error inserting batch ${i / batchSize + 1}:`, error);
            } else {
                console.log(`Inserted batch ${i / batchSize + 1} (${batch.length} records)`);
            }
        }

        console.log('Import completed!');

    } catch (error) {
        console.error('Import failed:', error);
    }
}

importSchools();
