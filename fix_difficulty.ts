
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixDifficulty() {
    console.log("Fixing null difficulties for Yeong-dong Il High School...");

    // Find IDs
    const { data: questions, error: fetchError } = await supabase
        .from('questions')
        .select('id')
        .eq('school', '영동일고등학교')
        .eq('work_status', 'sorted')
        .is('difficulty', null);

    if (fetchError) {
        console.error("Fetch Error:", fetchError);
        return;
    }

    if (!questions || questions.length === 0) {
        console.log("No questions found needing fix.");
        return;
    }

    const ids = questions.map(q => q.id);
    console.log(`Found ${ids.length} questions to fix.`);

    const { error: updateError } = await supabase
        .from('questions')
        .update({ difficulty: '1' })
        .in('id', ids);

    if (updateError) {
        console.error("Update Error:", updateError);
    } else {
        console.log(`Successfully updated ${ids.length} questions to difficulty '1'.`);
    }
}

fixDifficulty();
