// fix_rls_security.js
// Supabase RLS 보안 취약점 자동 수정 스크립트

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eupclfzfouxzzmipjchz.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1cGNsZnpmb3V4enptaXBqY2h6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Njk5Njc5NCwiZXhwIjoyMDgyNTcyNzk0fQ.SynMUk_1VU1LPFCp8jXCFE9UfqpLx6RUghrTuWO086k';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function runSQL(sql, description) {
  console.log(`\n▶ ${description}...`);
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).catch(() => ({ error: { message: 'rpc not available' } }));
  if (error) {
    // rpc 없으면 직접 REST API로 실행
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql_query: sql })
    });
    const text = await res.text();
    if (!res.ok) {
      console.log(`  ⚠️  결과: ${text}`);
      return false;
    }
  }
  console.log(`  ✅ 완료`);
  return true;
}

async function checkTablesRLS() {
  console.log('=== Supabase RLS 현황 조회 ===\n');
  
  // information_schema를 통해 테이블 목록 조회
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_rls_status`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  
  // 직접 pg_tables 조회
  const tablesRes = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    }
  });
  
  const tablesData = await tablesRes.json();
  if (Array.isArray(tablesData) || tablesData.definitions) {
    console.log('발견된 테이블 엔드포인트:', JSON.stringify(Object.keys(tablesData.definitions || tablesData).slice(0, 20), null, 2));
  }
}

// ============================================================
// 메인: SQL Migration 파일 직접 실행 (Supabase Management API)
// ============================================================
async function applyRLSMigration() {
  console.log('=== Supabase RLS 보안 패치 시작 ===\n');
  
  const MANAGEMENT_API = 'https://api.supabase.com';
  const PROJECT_REF = 'eupclfzfouxzzmipjchz';
  
  // Management API 토큰 없이는 직접 SQL 실행 불가
  // 대신 Service Role Key로 Supabase JS Client를 통해 가능한 것들 실행
  
  // 1. 현재 public 테이블 목록 확인
  const { data: tables, error: tableErr } = await supabase
    .from('information_schema.tables')
    .select('table_name, table_schema')
    .eq('table_schema', 'public')
    .eq('table_type', 'BASE TABLE');
  
  if (tableErr) {
    console.log('테이블 조회 오류:', tableErr.message);
    console.log('\n→ Supabase Dashboard SQL Editor에서 직접 실행할 SQL을 생성합니다.\n');
  } else {
    console.log('발견된 테이블:', tables?.map(t => t.table_name));
  }
  
  // SQL 파일 생성
  const fs = require('fs');
  const migrationSQL = generateRLSSQL();
  fs.writeFileSync('./rls_fix_migration.sql', migrationSQL, 'utf-8');
  console.log('\n✅ rls_fix_migration.sql 파일이 생성되었습니다.');
  console.log('📋 이 파일을 Supabase Dashboard > SQL Editor에 붙여넣고 실행하세요.\n');
  console.log(migrationSQL);
}

function generateRLSSQL() {
  return `-- ================================================================
-- RLS 보안 패치 마이그레이션
-- 생성일: ${new Date().toISOString()}
-- Supabase 보안 경고 대응
-- ================================================================

-- 1. questions 테이블: 현재 "allow all" 정책이 민감 데이터 노출
-- 공개 읽기는 허용하되, 쓰기는 인증된 사용자만
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for all users" ON public.questions;

CREATE POLICY "Public can read questions" 
  ON public.questions FOR SELECT 
  USING (true);

CREATE POLICY "Only authenticated users can insert questions" 
  ON public.questions FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Only authenticated users can update questions" 
  ON public.questions FOR UPDATE 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Only authenticated users can delete questions" 
  ON public.questions FOR DELETE 
  USING (auth.role() = 'authenticated');

-- 2. exam_materials 테이블: RLS 확인 및 강화
ALTER TABLE public.exam_materials ENABLE ROW LEVEL SECURITY;

-- 3. profiles 테이블: 민감한 개인정보 보호
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

-- 4. purchases 테이블
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

-- 5. payment_history 테이블
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

-- 6. notices 테이블
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

-- 7. user_items 테이블 (개인 DB) - 존재하는 경우
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_items') THEN
    EXECUTE 'ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage own items" ON public.user_items';
    EXECUTE $policy$
      CREATE POLICY "Users can manage own items" 
        ON public.user_items 
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;

-- 8. point_settlements 테이블 - 존재하는 경우
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'point_settlements') THEN
    EXECUTE 'ALTER TABLE public.point_settlements ENABLE ROW LEVEL SECURITY';
    EXECUTE $policy$
      CREATE POLICY "Users can view own settlements" 
        ON public.point_settlements FOR SELECT
        USING (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;

-- 9. phone_verifications 테이블 - 존재하는 경우
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'phone_verifications') THEN
    EXECUTE 'ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY';
    EXECUTE $policy$
      CREATE POLICY "Users can manage own verifications" 
        ON public.phone_verifications
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;

-- ================================================================
-- 검증: RLS 활성화 현황 확인
-- ================================================================
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
`;
}

applyRLSMigration().catch(console.error);
