import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixMetadata() {
    console.log('--- Fetching all records with file_type === "DB" ---');
    const { data, error } = await supabase
        .from('exam_materials')
        .select('*')
        .eq('file_type', 'DB');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${data.length} records. Inspecting...`);

    for (const item of data) {
        let needsUpdate = false;
        const updates: any = {};

        if (item.content_type !== '개인DB') {
            updates.content_type = '개인DB';
            needsUpdate = true;
        }

        if (item.title && item.title.includes('[문제+해설]')) {
            updates.title = item.title.replace('[문제+해설]', '[개인DB]');
            needsUpdate = true;
        }

        if (needsUpdate) {
            console.log(`Updating ID ${item.id} | New Title: ${updates.title || item.title} | New ContentType: 개인DB`);
            const { error: updateError } = await supabase
                .from('exam_materials')
                .update(updates)
                .eq('id', item.id);
            if (updateError) console.error(`Failed to update ${item.id}:`, updateError);
        } else {
            console.log(`ID ${item.id} is already correct.`);
        }
    }
}

fixMetadata();
