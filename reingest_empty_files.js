/**
 * reingest_empty_files.js
 * 
 * questions가 0개인 파일들을 Supabase Storage에서 읽어
 * 로컬 파서로 다시 파싱하여 DB에 적재합니다.
 * 
 * 실행: node reingest_empty_files.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('=== 0문제 파일 일괄 Re-ingest ===\n');

  // 1. 모든 파일 가져오기
  const { data: files, error: fErr } = await supabase
    .from('files')
    .select('id, original_name, storage_path, created_at');
  if (fErr) { console.error('files 조회 실패:', fErr); return; }

  // 2. 문제 수 집계
  const { data: allQ } = await supabase.from('questions').select('file_id');
  const qByFile = {};
  for (const q of allQ) {
    qByFile[q.file_id] = (qByFile[q.file_id] || 0) + 1;
  }

  // 3. 0문제이면서 .hml 파일인 것만 추출 (중복 파일명 제거: 같은 이름 중 가장 최신 것만)
  const byName = {};
  for (const f of files) {
    if (!f.original_name.endsWith('.hml')) continue;
    if ((qByFile[f.id] || 0) > 0) continue; // 이미 문제 있으면 스킵
    
    const existing = byName[f.original_name];
    if (!existing || new Date(f.created_at) > new Date(existing.created_at)) {
      byName[f.original_name] = f;
    }
  }

  const targets = Object.values(byName);
  console.log(`대상 파일 수: ${targets.length}개\n`);

  // 4. 각 파일에 대해 Storage에서 HML 다운로드 후 파싱
  let successCount = 0;
  let failCount = 0;
  const failures = [];

  for (let i = 0; i < targets.length; i++) {
    const f = targets[i];
    console.log(`[${i+1}/${targets.length}] ${f.original_name}`);

    // Storage에서 HML 다운로드
    const { data: blob, error: dlErr } = await supabase.storage
      .from('hwpx')
      .download(f.storage_path);

    if (dlErr || !blob) {
      console.error(`  ❌ 다운로드 실패:`, dlErr?.message || '파일 없음');
      failCount++;
      failures.push({ name: f.original_name, reason: 'download_failed: ' + (dlErr?.message || 'no blob') });
      continue;
    }

    const hmlContent = await blob.text();
    
    if (hmlContent.length < 100) {
      console.error(`  ❌ 파일 내용 너무 짧음 (${hmlContent.length}자)`);
      failCount++;
      failures.push({ name: f.original_name, reason: 'too_short' });
      continue;
    }

    // 파서는 Next.js 모듈이라 직접 import 불가 - API 호출 방식으로
    // 로컬 서버가 실행 중이어야 함
    const devUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    
    // FormData 구성 - 파일명에서 메타데이터 추출 시도
    const meta = extractMeta(f.original_name);
    
    try {
      const { FormData, Blob: NodeBlob } = await import('node-fetch').catch(() => ({ FormData: global.FormData, Blob: global.Blob }));
      
      // node 18+ 내장 fetch 사용
      const formData = new global.FormData();
      const fileBlob = new global.Blob([hmlContent], { type: 'text/xml' });
      formData.append('file', fileBlob, f.original_name);
      formData.append('school', meta.school);
      formData.append('region', meta.region);
      formData.append('district', meta.district);
      formData.append('year', meta.year);
      formData.append('semester', meta.semester);
      formData.append('subject', meta.subject);
      formData.append('grade', meta.grade);

      const resp = await fetch(`${devUrl}/api/admin/ingest-hml`, {
        method: 'POST',
        headers: {
          'x-admin-secret': process.env.ADMIN_SECRET || ''
        },
        body: formData
      });

      const json = await resp.json();

      if (json.success) {
        console.log(`  ✅ 성공: ${json.questionCount}문제 적재 (새 file_id: ${json.fileId})`);
        
        // 구 file 레코드 삭제 (정리)
        await supabase.from('files').delete().eq('id', f.id);
        console.log(`  🗑️  구 레코드 삭제: ${f.id.slice(0,8)}`);
        
        successCount++;
      } else {
        console.error(`  ❌ 파싱 실패:`, json.error);
        failCount++;
        failures.push({ name: f.original_name, reason: json.error, debug: json.debug });
      }
    } catch (e) {
      console.error(`  ❌ 요청 오류:`, e.message);
      failCount++;
      failures.push({ name: f.original_name, reason: e.message });
    }

    // API 과부하 방지
    await sleep(300);
  }

  console.log('\n=== 완료 ===');
  console.log(`성공: ${successCount}개`);
  console.log(`실패: ${failCount}개`);
  if (failures.length > 0) {
    console.log('\n실패 목록:');
    for (const f of failures) {
      console.log(` - ${f.name}: ${f.reason}`);
      if (f.debug) console.log('   debug:', JSON.stringify(f.debug).slice(0, 200));
    }
  }
}

/**
 * 파일명에서 메타데이터 추출
 * 예: 서울강남구2025년1학기중간고사숙명여고공통수학1.hml
 */
function extractMeta(filename) {
  const name = filename.replace(/\.hml$/i, '').replace(/^[oO]/, '').replace(/^ㅊㄱ/, '').replace(' - 복사본', '').replace(/^(업해야함|검사필요|up)/, '');

  const meta = {
    region: '',
    district: '',
    school: '',
    year: '',
    semester: '',
    subject: '',
    grade: ''
  };

  // 연도 추출
  const yearMatch = name.match(/(\d{2,4})년?/);
  if (yearMatch) {
    const y = yearMatch[1];
    meta.year = y.length === 2 ? '20' + y : y;
  }

  // 학기 추출
  if (name.includes('중간고사') || name.includes('1학기')) meta.semester = '1';
  else if (name.includes('기말고사') || name.includes('2학기')) meta.semester = '2';

  // 지역 추출
  const regions = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  for (const r of regions) {
    if (name.includes(r)) { meta.region = r; break; }
  }

  // 구 추출
  const districtMatch = name.match(/([가-힣]+구)/);
  if (districtMatch) meta.district = districtMatch[1];

  // 과목 추출
  if (name.includes('공통수학1')) meta.subject = '공통수학1';
  else if (name.includes('공통수학2')) meta.subject = '공통수학2';
  else if (name.includes('대수')) meta.subject = '대수';
  else if (name.includes('확통') || name.includes('확률과통계')) meta.subject = '확률과통계';
  else if (name.includes('미적분')) meta.subject = '미적분';
  else if (name.includes('기하')) meta.subject = '기하';
  else meta.subject = '수학';

  // 학교 추출: 지역+구 다음에 나오는 고등학교/고교명
  const schoolMatch = name.match(/고사([가-힣]+(?:고등학교|고|여고|여자고등학교))/);
  if (schoolMatch) meta.school = schoolMatch[1];

  // 학년 추출
  const gradeMatch = name.match(/고([123])/) || name.match(/([123])학년/);
  if (gradeMatch) meta.grade = gradeMatch[1];

  return meta;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(console.error);
