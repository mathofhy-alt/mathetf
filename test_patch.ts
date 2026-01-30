
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testPatch() {
    const targetId = 'b273da99-e5a5-41ae-8446-63099f2a8cbd'; // One of the nulls
    console.log(`Patching ID: ${targetId} with difficulty '1'...`);

    const { error } = await supabase
        .from('questions')
        .update({ difficulty: '1' })
        .eq('id', targetId);

    if (error) {
        console.error("Patch Error:", error);
    } else {
        console.log("Patch Success.");
        // Verify
        const { data } = await supabase.from('questions').select('difficulty').eq('id', targetId).single();
        console.log("Verified Content:", data);
    }
}

testPatch();
