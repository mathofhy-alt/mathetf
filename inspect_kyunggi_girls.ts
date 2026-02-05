
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function inspectKyunggiGirls() {
    console.log("--- Fetching one Kyunggi Girls' High School Question ---");
    const { data: qData, error: qError } = await supabase
        .from('questions')
        .select('id, content_xml, fragment_xml, school')
        .eq('school', '경기여자고등학교')
        .limit(1);

    if (qError) {
        console.error("Error fetching:", qError);
        return;
    }

    if (!qData || qData.length === 0) {
        console.log("No questions found for 경기여자고등학교. Trying partial match...");
        const { data: qData2, error: qError2 } = await supabase
            .from('questions')
            .select('id, content_xml, fragment_xml, school')
            .ilike('school', '%경기여%')
            .limit(1);

        if (qError2) console.error("Error fetching (partial):", qError2);
        else if (qData2 && qData2.length > 0) {
            console.log("Found via partial match:", qData2[0].school);
            printQ(qData2[0]);
        } else {
            console.log("No questions found even with partial match.");
        }
    } else {
        printQ(qData[0]);
    }
}

function printQ(q: any) {
    console.log("ID:", q.id);
    console.log("School:", q.school);
    console.log("Content XML Length:", q.content_xml?.length);
    console.log("Fragment XML Length:", q.fragment_xml?.length);
    console.log("\n--- CONTENT_XML ---");
    console.log(q.content_xml);
    console.log("\n--- FRAGMENT_XML ---");
    console.log(q.fragment_xml);
}

inspectKyunggiGirls();
