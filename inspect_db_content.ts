
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = 'https://eupclfzfouxzzmipjchz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1cGNsZnpmb3V4enptaXBqY2h6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Njk5Njc5NCwiZXhwIjoyMDgyNTcyNzk0fQ.SynMUk_1VU1LPFCp8jXCFE9UfqpLx6RUghrTuWO086k';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    // ID from logs: 1769680541052 (from "RESIZED MANUAL_Q_...")
    // Wait, that ID is likely an image ID or temp ID?
    // Let's fetch ANY question from 'questions' table limit 1.

    console.log('Fetching 1 question...');
    const { data, error } = await supabase
        .from('questions')
        .select('id, content_xml, images')
        .limit(1);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('No questions found.');
        return;
    }

    const q = data[0];
    console.log(`Question ID: ${q.id}`);
    console.log(`Images Count: ${q.images ? q.images.length : 0}`);

    if (q.content_xml) {
        console.log(`Content XML Size: ${q.content_xml.length} chars`);
        console.log(`--- Snippet (First 500) ---`);
        console.log(q.content_xml.substring(0, 500));
        console.log(`--- Snippet (Last 500) ---`);
        console.log(q.content_xml.substring(q.content_xml.length - 500));
    } else {
        console.log('Content XML is empty/null');
    }
}

inspect();
