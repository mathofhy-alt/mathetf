import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const school = "휘문고";
  const year = "2025";
  const semester = "1학기 중간"; // Example, maybe it's just '1학기중간' or similar

  // Get questions
  const { data: qData, error: qErr } = await supabase
    .from('questions')
    .select('id, difficulty, semester, subject, year, school')
    .like('school', '%휘문고%')
    .eq('year', 2025);

  if (qErr) {
    console.error("Error fetching questions:", qErr);
    return;
  }

  console.log(`\nFound ${qData.length} questions for ${school} ${year} 1학기 중간`);
  
  let calculatedPrice = 0;
  for (const q of qData) {
    const diff = parseInt(q.difficulty) || 1;
    calculatedPrice += diff * 500;
  }
  
  console.log(`Calculated Price from questions (sum of diff*500): ${calculatedPrice} P`);

  // Get exam_materials
  const { data: emData, error: emErr } = await supabase
    .from('exam_materials')
    .select('id, title, price, subject, content_type, school, exam_year')
    .like('title', '%휘문고%')
    .like('title', '%2025%')
    .eq('content_type', '개인DB');

  if (emErr) {
    console.error("Error fetching exam materials:", emErr);
    return;
  }

  console.log(`\nFound ${emData.length} exam materials (개인DB) for ${school} ${year} 1학기 중간`);
  for (const em of emData) {
    console.log(`- Title: ${em.title}`);
    console.log(`- DB Price: ${em.price} P`);
    console.log(`- exam_materials DB School: ${em.school}, Exam_year: ${em.exam_year}`);
    
    if (em.price !== calculatedPrice && qData.length > 0) {
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
    } else if (qData.length > 0) {
      console.log(`✅ MATCH: DB price is synced correctly!`);
    }
  }
}

main().catch(console.error);
