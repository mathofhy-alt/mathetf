// apply_rls_via_api.js
// Supabase Management API를 통해 RLS SQL 직접 실행

const PROJECT_REF = 'eupclfzfouxzzmipjchz';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1cGNsZnpmb3V4enptaXBqY2h6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Njk5Njc5NCwiZXhwIjoyMDgyNTcyNzk0fQ.SynMUk_1VU1LPFCp8jXCFE9UfqpLx6RUghrTuWO086k';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

// Postgres REST API (pg_rest) 방식으로 SQL 실행
async function execSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'GET',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    }
  });
  
  // Supabase의 /pg endpoint 사용 (일부 버전에서 지원)
  const pgRes = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql })
  });
  
  if (pgRes.ok) {
    return await pgRes.json();
  }
  
  return { error: `${pgRes.status}: ${await pgRes.text()}` };
}

// Supabase DB REST를 통한 RPC 호출
async function runQuery(sql) {
  // Supabase Edge Function 없이 직접 SQL 실행하는 방법:
  // 1. PostgREST를 통한 RPC
  // 2. Supabase Management API (별도 Personal Access Token 필요)
  
  // Service Role Key로 직접 쿼리 실행 시도
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pg_query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({ query: sql })
  });
  
  const text = await response.text();
  return { status: response.status, body: text };
}

// 개별 테이블에 RLS 정책 적용 (PostgREST를 통해 가능한 방법)
async function checkCurrentState() {
  console.log('현재 RLS 상태 확인 중...\n');
  
  // 각 테이블에 접근 시도 (anon key로)
  const ANON_KEY = 'sb_publishable_3n7jaw_mi3SM56ces7Pylg_ujPC_KLP'; // from env
  
  const tables = ['questions', 'exam_materials', 'profiles', 'purchases', 'payment_history', 'notices', 'user_items'];
  
  for (const table of tables) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?limit=1`, {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`
      }
    });
    const status = res.status;
    let accessible = false;
    if (status === 200) {
      const data = await res.json();
      accessible = Array.isArray(data);
    }
    
    const icon = (status === 200) ? '🔴 접근가능(취약)' : (status === 401 || status === 403) ? '🟢 차단됨(안전)' : `⚪ ${status}`;
    console.log(`  ${table}: ${icon}`);
  }
}

async function main() {
  console.log('=== Supabase RLS 보안 상태 점검 ===\n');
  await checkCurrentState();
  
  console.log('\n=== SQL 실행 시도 ===\n');
  
  // Supabase Management API (Personal Access Token 필요)
  // PAT 없이는 SQL Editor 방식 사용 불가
  // 대신 직접 pg_net 또는 Edge Function을 통해야 함
  
  const result = await runQuery('SELECT current_user');
  console.log('pg_query RPC 결과:', result);
  
  console.log('\n⚠️  Service Role Key만으로는 DDL SQL(ALTER TABLE, CREATE POLICY)을 직접 실행할 수 없습니다.');
  console.log('📌 Supabase Dashboard에서 직접 실행하거나,');
  console.log('   Supabase CLI (supabase db push)를 사용해야 합니다.\n');
}

main().catch(console.error);
