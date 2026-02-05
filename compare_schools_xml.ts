
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function compareSchools() {
    const schools = ['경기고등학교', '경기여자고등학교'];

    for (const school of schools) {
        console.log(`\n--- Fetching Question for ${school} ---`);
        const { data, error } = await supabase
            .from('questions')
            .select('id, content_xml, school')
            .eq('school', school)
            .limit(1);

        if (error) {
            console.error(`Error for ${school}:`, error);
            continue;
        }

        if (data && data.length > 0) {
            const q = data[0];
            console.log("ID:", q.id);
            const xml = q.content_xml || '';
            console.log("XML Start:", xml.substring(0, 500));

            // Analyze the first paragraph structure
            if (xml.includes('<P')) {
                const pStart = xml.indexOf('<P');
                const pEnd = xml.indexOf('</P>', pStart) + 4;
                const pXml = xml.substring(pStart, pEnd);
                console.log("First Paragraph XML:", pXml);
            }
        } else {
            console.log(`No data for ${school}`);
        }
    }
}

compareSchools();
