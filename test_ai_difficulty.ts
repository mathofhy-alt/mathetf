import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { predictDifficulty } from './src/lib/embeddings.js'; // Use .js for tsx execution if needed, or just standard import

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugAI() {
    const { data, error } = await supabase
        .from('questions')
        .select('id, question_number, school, difficulty, plain_text, equation_scripts')
        .ilike('school', '%문정고%')
        .eq('work_status', 'unsorted')
        .limit(21);

    if (error || !data || data.length === 0) {
        console.error("Error or no data");
        return;
    }

    console.log(`Evaluating ${data.length} questions...`);

    for (const q of data) {
        const textForPrediction = [
            q.plain_text || '',
            ...(q.equation_scripts || [])
        ].join(' ').trim();

        const difficulty = await predictDifficulty(textForPrediction);
        console.log(`Q#${q.question_number} -> AI Predicted: ${difficulty}`);
    }
}

debugAI();
