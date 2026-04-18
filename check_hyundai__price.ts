import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const school = "현대고";

  // Get questions
  const { data: qData, error: qErr } = await supabase
    .from('questions')
    .select('id, difficulty, semester, subject, year, school, grade')
    .like('school', '%현대고%')
    .eq('year', 2025);

  if (qErr) {
    console.error("Error fetching questions:", qErr);
    return;
  }

  // group questions by (school, year, grade, semester, subject)
  const groupedQs: Record<string, any[]> = {};
  for (const q of qData) {
    const key = `${q.school}|${q.year}|${q.grade}|${q.semester}|${q.subject}`;
    if (!groupedQs[key]) groupedQs[key] = [];
    groupedQs[key].push(q);
  }

  for (const [key, qs] of Object.entries(groupedQs)) {
    const [s_school, s_year, s_grade, s_sem, s_sub] = key.split('|');
    
    let calculatedPrice = 0;
    for (const q of qs) {
      const diff = parseInt(q.difficulty) || 1;
      calculatedPrice += diff * 500;
    }
    
    console.log(`\n--- Group: ${key} (${qs.length} questions) ---`);
    console.log(`Calculated Price from questions (sum of diff*500): ${calculatedPrice} P`);

    const shortSchool = s_school.replace(/고등학교|고/g, '');
    const gradeNum = Number(String(s_grade).replace(/[^0-9]/g, '')) || 0;
    let examType = '';
    if (s_sem.includes('중간')) examType = '중간고사';
    else if (s_sem.includes('기말')) examType = '기말고사';

    // Build query to find matching exam_materials
    let query = supabase
      .from('exam_materials')
      .select('id, title, price, subject, content_type, school, exam_year')
      .eq('content_type', '개인DB')
      .ilike('school', `%${shortSchool}%`)
      .eq('exam_year', Number(s_year))
      .eq('grade', gradeNum)
      .eq('subject', s_sub);
      
    if (examType) query = query.eq('exam_type', examType);

    const { data: emData, error: emErr } = await query;

    if (emErr) {
      console.error("Error fetching exam materials:", emErr);
      continue;
    }

    if (emData.length === 0) {
      console.log(`No matching exam_materials found for criteria.`);
    }

    for (const em of emData) {
      console.log(`- Title: ${em.title}`);
      console.log(`- Current DB Price: ${em.price} P`);
      
      if (em.price !== calculatedPrice) {
        console.log(`⚠️ MISMATCH: DB price is ${em.price}, calculated is ${calculatedPrice}`);
        const { error: updErr } = await supabase
          .from('exam_materials')
          .update({ price: calculatedPrice })
          .eq('id', em.id);
          
        if (updErr) {
          console.error("Failed to update price:", updErr);
        } else {
          console.log(`✅ Success: Updated DB price to ${calculatedPrice}`);
        }
      } else {
        console.log(`✅ MATCH: DB price is synced correctly!`);
      }
    }
  }
}

main().catch(console.error);
