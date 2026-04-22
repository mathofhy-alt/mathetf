import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixQuestions() {
    const materialId = 'f6bad34b-be14-40eb-af7e-9c52f0ff68d6';

    const { data: examQs } = await supabase
        .from('questions')
        .select('*')
        .eq('source_db_id', materialId);
        
    if (examQs && examQs.length > 0) {
        console.log(`Found ${examQs.length} questions attached to this file via source_db_id!`);
        
        const { error: qError } = await supabase
            .from('questions')
            .update({ semester: 11 })
            .eq('source_db_id', materialId);
            
        if (qError) {
            console.error('Error updating questions:', qError);
        } else {
            console.log('Successfully updated questions metadata semester to 11.');
        }
    } else {
        console.log('No questions found via source_db_id either.');
    }
}

fixQuestions();
