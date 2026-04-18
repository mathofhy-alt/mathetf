const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load env vars
function loadEnv() {
    try {
        const envFile = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8');
        const env = {};
        envFile.split('\n').forEach(line => {
            const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (match) {
                env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
            }
        });
        return env;
    } catch (e) {
        console.error(".env.local not found");
        return process.env;
    }
}

const env = loadEnv();
const url = env['NEXT_PUBLIC_SUPABASE_URL'] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = env['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error("Missing supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
    console.log("Fetching all 개인DB materials...");
    const { data: materials, error } = await supabase
        .from('exam_materials')
        .select('*')
        .eq('content_type', '개인DB');

    if (error) {
        console.error("Error fetching materials:", error);
        return;
    }

    console.log(`Found ${materials.length} 개인DB materials.`);
    
    let updatedCount = 0;

    for (const mat of materials) {
        const school = mat.school;
        const year = mat.exam_year;
        const grade = mat.grade;
        const semesterNum = mat.semester;
        const subject = mat.subject;
        const exam_type = mat.exam_type;
        
        let gradeVal = String(grade);
        if (['1', '2', '3'].includes(gradeVal.replace(/[^0-9]/g, ''))) {
            gradeVal = `고${gradeVal.replace(/[^0-9]/g, '')}`;
        }
        
        let semesterVal = '';
        if (exam_type === '모의고사' || exam_type === '수능') {
            semesterVal = `${semesterNum}월`;
        } else {
            const typeShort = exam_type.includes('중간') ? '중간' : (exam_type.includes('기말') ? '기말' : '');
            semesterVal = typeShort ? `${semesterNum}학기${typeShort}` : `${semesterNum}학기`;
        }
        
        // Exact match
        let { data: qData } = await supabase
            .from('questions')
            .select('difficulty')
            .ilike('school', `%${school}%`)
            .eq('year', String(year))
            .eq('grade', gradeVal)
            .eq('semester', semesterVal)
            .eq('subject', subject);
            
        let finalQs = qData;
        
        // Relaxed match
        if (!finalQs || finalQs.length === 0) {
            const subSchool = school.length > 4 ? school.substring(0, 4) : school;
            const { data: rData } = await supabase
                .from('questions')
                .select('difficulty')
                .ilike('school', `%${subSchool}%`)
                .eq('year', String(year))
                .eq('grade', gradeVal)
                .eq('semester', semesterVal)
                .eq('subject', subject);
            if (rData && rData.length > 0) finalQs = rData;
        }
        
        if (finalQs && finalQs.length > 0) {
            let newPrice = 0;
            if (exam_type === '모의고사' || exam_type === '수능') {
                newPrice = 0; 
            } else {
                finalQs.forEach(q => {
                    const diff = parseInt(String(q.difficulty)) || 1;
                    newPrice += diff * 500;
                });
            }
            
            if (mat.price !== newPrice) {
                console.log(`Updating ID ${mat.id} [${mat.title}] => Old: ${mat.price}, New: ${newPrice}`);
                const { error: upErr } = await supabase
                    .from('exam_materials')
                    .update({ price: newPrice })
                    .eq('id', mat.id);
                if (upErr) {
                    console.error("Update fail:", upErr);
                } else {
                    updatedCount++;
                }
            }
        }
    }
    
    console.log(`Complete. Modified ${updatedCount} items.`);
}

run();
