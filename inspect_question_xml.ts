
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

async function inspectQuestionXml(id: string) {
    const { data, error } = await supabase
        .from('questions')
        .select('content_xml')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('--- CONTENT_XML ---');
    console.log(data.content_xml);
    console.log('-------------------');
}

// Using the ID from the previous list
const targetId = '3c695cbf-8b61-40d8-930e-c8525473ea90';
inspectQuestionXml(targetId);
