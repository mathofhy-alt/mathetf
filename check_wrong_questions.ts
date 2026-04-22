import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkQuestions() {
    console.log('Checking questions for material ID: f6bad34b-be14-40eb-af7e-9c52f0ff68d6');
    
    // First, check the questions table fields
    const { data: q, error } = await supabase
        .from('questions')
        .select('*')
        .eq('material_id', 'f6bad34b-be14-40eb-af7e-9c52f0ff68d6')
        .limit(1);

    if (error) {
        console.error('Error fetching questions:', error);
        return;
    }

    if (!q || q.length === 0) {
        console.log('No questions found for this material.');
        return;
    }

    console.log('Question structure:', Object.keys(q[0]).join(', '));
    console.log('Sample question metadata:');
    console.log(`Year: ${q[0].year}, ExamType: ${q[0].exam_type}, ExtractedText: ${q[0].extracted_text?.substring(0,50)}...`);
}

checkQuestions();
