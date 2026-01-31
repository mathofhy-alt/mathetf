
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function recoverSookmyung() {
    console.log('Restoring incorrectly updated difficulties...');

    // 1. Restore '4'
    const idsTo4 = [
        '766a927b-37aa-422e-8e8b-d5e4ee7af4eb',
        '78f4efc4-92ea-48d9-9725-e3d911f17e2a',
        '6b8da201-1819-46a6-ac52-91050f143f6f',
        '72f6b12c-7eda-427c-a943-ba780d73a3cd',
        '3948b111-8233-4d9d-af52-9fa06764b798'
    ];
    if (idsTo4.length > 0) {
        await supabase.from('questions').update({ difficulty: '4' }).in('id', idsTo4);
        console.log(`Restored ${idsTo4.length} questions to difficulty '4'.`);
    }

    // 2. Restore '2'
    const idsTo2 = [
        'ba337e87-9f9a-4663-a3d0-ce448862ab45',
        '4577ac21-b3ea-481d-86d3-1a970deefc9c',
        '6c230d49-b49e-4b65-a35c-7cd450c48fde',
        'cf1ba0c5-e022-4fc4-b8f7-015b4bc9ff8a',
        'dd7dc487-9ff8-4636-a962-38400b37c874',
        '76637db2-b217-475e-b333-ddfcbf33a644',
        '8c3cdfc0-b90b-4396-af85-fe7b2490b736'
    ];
    if (idsTo2.length > 0) {
        await supabase.from('questions').update({ difficulty: '2' }).in('id', idsTo2);
        console.log(`Restored ${idsTo2.length} questions to difficulty '2'.`);
    }

    // 3. Restore 'null'
    const idsToNull = [
        '2d3b0bb0-9bc8-432d-a738-765892d62c6f',
        'fb6df3a9-dd7c-4068-bc83-1d15ee9a61a4',
        '2c85e50f-9e88-41d4-b125-aed585237f01',
        '2e00c6f4-7839-4185-9eca-0a5bf9a03bfd',
        'f8ce7134-59c6-4d2f-9600-3e414b400561',
        'b3cbe8be-e72d-4693-bf92-51e1dafaae9d',
        '3b43fdaf-e5c3-4a73-b778-908ba22bf58c'
    ];
    if (idsToNull.length > 0) {
        await supabase.from('questions').update({ difficulty: null }).in('id', idsToNull);
        console.log(`Restored ${idsToNull.length} questions to difficulty 'null'.`);
    }

    // The ones that were '3' (Medium) are now '1'. This is what the user wanted ("Change Medium to 1").
    // IDs: 
    // '9f9600da-678b-4f4a-ac70-2fab6aa3b1fe', 
    // '1c4014e8-80b9-4d37-9532-da83b5136f5f', 
    // 'b5447408-fc50-4fd3-bf15-f62faf1bffd0', 
    // '3c695cbf-8b61-40d8-930e-c8525473ea90'
    console.log("Kept original 'Medium' (3) questions as '1'.");
}

recoverSookmyung();
