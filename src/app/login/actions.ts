'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
    const supabase = createClient()

    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        redirect(`/login?message=${encodeURIComponent('로그인 실패: 이메일 또는 비밀번호를 확인해주세요.')}`)
    }

    // Manual Email Verification Check
    if (data.user && !data.user.email_confirmed_at) {
        await supabase.auth.signOut()
        redirect(`/login?message=${encodeURIComponent('이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.')}`)
    }

    revalidatePath('/', 'layout')
    redirect('/')
}

// [보안] 전화인증 없는 직접 가입(취약)은 제거됨. 회원가입은 /api/auth/signup 서버 라우트(휴대폰 인증 강제)로만.
