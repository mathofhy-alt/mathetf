
import { HwpxMerger } from './src/lib/hwpx/merger';
import { createAdminClient } from './src/utils/supabase/server-admin';
import * as fs from 'fs';
import * as path from 'path';

async function runTest() {
    console.log("--- STARTING STANDALONE MERGER TEST ---");
    const supabase = createAdminClient();

    // 6 questions (roughly matching the UI selection 19, 20, 21, 22, 23, 24)
    const ids = [19, 20, 21, 22, 23, 24];

    const { data: questions, error } = await supabase
        .from('questions')
        .select('id, file_id, original_name, fragment_xml, question_number, storage_path')
        .in('id', ids)
        .order('question_number', { ascending: true });

    if (error || !questions) {
        console.error("Failed to fetch questions:", error);
        return;
    }

    console.log(`Fetched ${questions.length} questions.`);

    try {
        const buffer = await HwpxMerger.merge("dummy.hwpx", "merged_test.hwpx", questions);
        fs.writeFileSync('merged_test_output.hwpx', buffer);
        console.log("SUCCESS: merged_test_output.hwpx generated.");
    } catch (err) {
        console.error("MERGE_FAIL:", err);
    }
}

runTest();
