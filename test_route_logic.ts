import { createAdminClient } from './src/utils/supabase/server-admin';
import { generateTags } from './src/lib/embeddings';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
    const textToEmbed = "[과목: 대수] [학년: 고2] 부등식 log_4(3x - 2) >= 1 / log_{x-2} 2 를 만족하는 정수 x의 개수는?";
    let updatedConcepts = ["#부등식", "#로그방정식"]; // fake existing concepts
    let updatedUnit = null; // missing unit

    const needsTags = false;
    const needsUnit = true;

    if (needsTags || needsUnit) {
        console.log("Calling generateTags...");
        const tagData = await generateTags(textToEmbed, '대수');
        console.log("tagData returned:", tagData);
        
        if (needsUnit && tagData.unit) {
            updatedUnit = tagData.unit;
            console.log("updatedUnit is now:", updatedUnit);
        } else {
            console.log("needsUnit was true, but tagData.unit was empty/null!");
        }
    }
}
run();
