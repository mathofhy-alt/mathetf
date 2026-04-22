import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function test() {
    console.log('[TEST] 가입 및 트리거 연동 테스트 시작...');
    const testEmail = 'ai_test_' + Date.now() + '@test.com';
    
    // 1. 임의 계점 생성 (가입 폼에서 옵션으로 데이터 넘기는 것과 동일한 효과)
    const { data, error } = await supabase.auth.admin.createUser({
        email: testEmail,
        password: 'password123',
        email_confirm: true,
        user_metadata: {
            full_name: 'AI 집주소테스터',
            phone: '01012345678',
            postcode: '06236',
            address: '서울 강남구 테헤란로 123',
            address_detail: '101호'
        }
    });

    if (error) {
        console.log('Signup error:', error.message);
        return;
    }

    console.log('✅ 모의 계정 생성 완료:', data.user.id);
    
    // DB 트리거가 profiles 테이블에 행을 넣을 시간을 잠시 기다림
    await new Promise(r => setTimeout(r, 1000));

    // 2. Profiles 테이블 조회해서 주소가 진짜 잘 들어갔는지 확인
    const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
    
    if (pErr) {
        console.error('❌ Profiles 조회 실패 (SQL을 아직 안 돌리셨을 수 있습니다):', pErr.message);
    } else {
        console.log('✅ Profiles 테이블에 자동 등록된 결과물:');
        console.log(` - 닉네임: ${profile.display_name}`);
        console.log(` - 역할: ${profile.role}`);
        console.log(` - 우편번호: ${profile.postcode}`);
        console.log(` - 기본주소: ${profile.address}`);
        console.log(` - 상세주소: ${profile.address_detail}`);
        
        if (profile.address === '서울 강남구 테헤란로 123') {
            console.log('🚀 완벽합니다! DB 트리거가 주소를 성공적으로 포착하여 저장했습니다.');
        } else {
            console.log('⚠️ 주소가 NULL입니다. 아까 드린 SQL을 아직 실행하지 않으셨습니다!');
        }
    }

    // 3. 테스트 계정 청소 (실제 서비스에 남지 않게)
    await supabase.auth.admin.deleteUser(data.user.id);
    console.log('🧹 테스트 계정 삭제 완료.');
}

test();
