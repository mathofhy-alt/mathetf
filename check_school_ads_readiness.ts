import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://eupclfzfouxzzmipjchz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1cGNsZnpmb3V4enptaXBqY2h6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Njk5Njc5NCwiZXhwIjoyMDgyNTcyNzk0fQ.SynMUk_1VU1LPFCp8jXCFE9UfqpLx6RUghrTuWO086k'
);

async function main() {
  // 학교별 시험지(exam_materials) 개수 집계
  const { data, error } = await supabase
    .from('exam_materials')
    .select('school, subject, grade, semester, exam_type, exam_year, is_verified')
    .order('school');

  if (error) {
    console.error('❌ 쿼리 오류:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('데이터 없음');
    return;
  }

  // 학교별 집계
  const schoolMap: Record<string, {
    total: number;
    selling: number;
    subjects: Set<string>;
    grades: Set<number>;
    years: Set<number>;
  }> = {};

  for (const row of data) {
    const name = row.school || '(학교명 없음)';
    if (!schoolMap[name]) {
      schoolMap[name] = { total: 0, selling: 0, subjects: new Set(), grades: new Set(), years: new Set() };
    }
    schoolMap[name].total++;
    if (row.is_verified !== false) schoolMap[name].selling++;
    if (row.subject) schoolMap[name].subjects.add(row.subject);
    if (row.grade) schoolMap[name].grades.add(row.grade);
    if (row.exam_year) schoolMap[name].years.add(row.exam_year);
  }

  // 정렬: 판매 중인 시험지 수 기준 내림차순
  const sorted = Object.entries(schoolMap)
    .sort(([, a], [, b]) => b.selling - a.selling);

  console.log('\n====== 📊 학교별 광고 준비도 분석 ======');
  console.log(`총 ${sorted.length}개 학교, ${data.length}개 시험지\n`);

  console.log('🟢 [광고 강추 - 판매중 5개 이상]');
  const adReady = sorted.filter(([, v]) => v.selling >= 5);
  for (const [school, v] of adReady) {
    const yearList = [...v.years].sort().join(', ');
    const subjectList = [...v.subjects].join(', ');
    console.log(`  ✅ ${school}: 판매중 ${v.selling}개 / 전체 ${v.total}개 | 연도: ${yearList} | 과목: ${subjectList}`);
  }

  console.log('\n🟡 [조금만 더 - 판매중 3~4개]');
  const adAlmost = sorted.filter(([, v]) => v.selling >= 3 && v.selling < 5);
  for (const [school, v] of adAlmost) {
    const yearList = [...v.years].sort().join(', ');
    console.log(`  ⚠️  ${school}: 판매중 ${v.selling}개 / 전체 ${v.total}개 | 연도: ${yearList}`);
  }

  console.log('\n🔴 [아직 이른 곳 - 판매중 2개 이하]');
  const adNotReady = sorted.filter(([, v]) => v.selling < 3);
  for (const [school, v] of adNotReady) {
    console.log(`  ❌ ${school}: 판매중 ${v.selling}개 / 전체 ${v.total}개`);
  }

  console.log('\n====== 광고 추천 키워드 ======');
  for (const [school, v] of adReady) {
    const subjects = [...v.subjects].join(', ');
    const years = [...v.years].sort();
    const yearRange = years.length > 1 ? `${years[0]}~${years[years.length-1]}년` : `${years[0]}년`;
    console.log(`  📌 "${school} 기출문제" | "${school} 수학 기출" (${yearRange}, ${subjects})`);
  }
}

main().catch(console.error);
