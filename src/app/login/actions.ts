'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { safeReturnPath } from '@/lib/auth-return'

export async function login(formData: FormData) {
    const supabase = createClient()
    const next = safeReturnPath(formData.get('next'))

    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        redirect(`/login?next=${encodeURIComponent(next)}&message=${encodeURIComponent('로그인 실패: 이메일 또는 비밀번호를 확인해주세요.')}`)
    }

    // Manual Email Verification Check
    if (data.user && !data.user.email_confirmed_at) {
        await supabase.auth.signOut()
        redirect(`/login?next=${encodeURIComponent(next)}&message=${encodeURIComponent('이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.')}`)
    }

    // [10/5] revalidatePath('/', 'layout') 제거 — 로그인할 때마다 사이트 전체 ISR 캐시를 지워 로그인 직후 홈을
    //   DB 에서 새로 그리느라 ~5초 걸렸고(사용자 체감), 다른 방문자 캐시까지 날아갔다. 로그인 상태는 헤더가
    //   브라우저에서 읽고, 위 signIn 이 쿠키를 설정하면 Next 가 클라이언트 라우터 캐시를 알아서 비운다.
    redirect(next)
}

// [보안] 전화인증 없는 직접 가입(취약)은 제거됨. 회원가입은 /api/auth/signup 서버 라우트(휴대폰 인증 강제)로만.
