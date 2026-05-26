const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://eupclfzfouxzzmipjchz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1cGNsZnpmb3V4enptaXBqY2h6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Njk5Njc5NCwiZXhwIjoyMDgyNTcyNzk0fQ.SynMUk_1VU1LPFCp8jXCFE9UfqpLx6RUghrTuWO086k'
);

async function main() {
  // title에 "기하 [개인DB]"로 남아있는 것들 → "기하와벡터 [개인DB]"로 수정
  const { data: giha } = await sb.from('exam_materials')
    .select('id, title, subject')
    .ilike('title', '%기하 [개인DB]%')
    .eq('file_type', 'DB');
  
  console.log('=== title "기하 [개인DB]" 남은 것 ===');
  giha?.forEach(m => console.log(`  "${m.title}" subject:${m.subject}`));
  
  for (const mat of (giha || [])) {
    const newTitle = mat.title.replace('기하 [개인DB]', '기하와벡터 [개인DB]');
    const { error } = await sb.from('exam_materials')
      .update({ title: newTitle })
      .eq('id', mat.id);
    if (error) console.error('에러:', error);
    else console.log(`  ✅ → "${newTitle}"`);
  }

  // 최종 선택과목 DB 현황 정리
  console.log('\n=== 선택과목 DB 최종 현황 ===');
  const { data: selDbs } = await sb.from('exam_materials')
    .select('title, subject, grade, exam_year, semester')
    .eq('file_type', 'DB')
    .in('subject', ['기하와벡터', '미적분II', '확률과통계'])
    .order('exam_year', { ascending: false });
  selDbs?.forEach(d => console.log(`  [${d.subject}] ${d.title}`));

  // 2025 9월 미적분II 선택문항 있는지 확인
  console.log('\n=== 2025 고3 9월 각 선택과목별 문항 현황 ===');
  const selectSubjects = ['기하와벡터', '미적분II', '확률과통계'];
  for (const sub of selectSubjects) {
    const { data: q } = await sb.from('questions')
      .select('question_number')
      .eq('school', '전국연합')
      .eq('year', '2025')
      .eq('grade', '고3')
      .ilike('semester', '%9월%')
      .eq('subject', sub)
      .gte('question_number', 23);
    console.log(`  ${sub}: 23~30번 ${q?.length || 0}개 ${q?.length === 8 ? '✅' : '❌ 없음 (재업로드 필요)'}`);
  }
}
main().catch(console.error);
