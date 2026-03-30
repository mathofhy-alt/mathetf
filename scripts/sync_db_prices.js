const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Fetching all personal DB materials...");
    const { data: materials, error } = await supabase
        .from('exam_materials')
        .select('id, school, exam_year, grade, semester, exam_type, subject, price')
        .eq('content_type', '개인DB')
        .neq('school', 'DELETED');
        
    if (error) {
        console.error("Error fetching materials:", error);
        return;
    }
    
    console.log(`Found ${materials.length} DB records. Recalculating...`);
    
    let updatedCount = 0;
    
    for (const m of materials) {
        let gradeStr = m.grade === 1 ? '고1' : (m.grade === 2 ? '고2' : '고3');
        let semStr = m.semester === 1 ? '1학기' : '2학기';
        if (m.exam_type === '중간고사') semStr += '중간';
        else if (m.exam_type === '기말고사') semStr += '기말';
        
        const { data: qs } = await supabase
            .from('questions')
            .select('difficulty')
            .eq('school', m.school)
            .eq('year', String(m.exam_year))
            .eq('grade', gradeStr)
            .ilike('semester', `${semStr}%`)
            .eq('subject', m.subject || '');
            
        if (qs) {
            let actualPrice = 0;
            qs.forEach(q => {
                const diff = parseInt(q.difficulty) || 1;
                if (diff <= 2) actualPrice += 1000;
                else if (diff <= 4) actualPrice += 2000;
                else if (diff <= 6) actualPrice += 3000;
                else if (diff <= 8) actualPrice += 4000;
                else actualPrice += 5000;
            });
            
            if (actualPrice !== m.price) {
                console.log(`[${m.school} ${m.exam_year} ${m.grade}학년 ${semStr}] Price mismatch: Saved=${m.price}, Actual=${actualPrice}. qs.length=${qs.length}`);
                if (qs.length === 0) {
                    console.log(`  -> Query was: year=${m.exam_year}, grade=${m.grade}학년, semester like ${semStr}%, subject=${m.subject}`);
                }
                await supabase.from('exam_materials').update({ price: actualPrice }).eq('id', m.id);
                updatedCount++;
            }
        }
    }
    console.log(`\n🎉 Done! Synchronized/Updated ${updatedCount} broken records.`);
}

main();
