import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // if "next" is in param, use it as the redirect URL
    const next = searchParams.get('next') ?? '/'

    if (code) {
        const supabase = createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // [10/5] 비밀번호 재설정 링크는 '요청한 그 브라우저'에서만 열린다(PKCE). PC 에서 요청하고 폰 메일앱에서 열면
    //   여기로 떨어지는데, 예전엔 영어 문구("Could not login with provider")만 보여 무엇을 해야 할지 몰랐다.
    if (next === '/update-password') {
        const msg = '링크가 만료됐거나 다른 기기·브라우저에서 열렸어요. 비밀번호 찾기를 요청한 그 브라우저에서 다시 요청해 메일 링크를 열어 주세요.';
        return NextResponse.redirect(`${origin}/forgot-password?message=${encodeURIComponent(msg)}`)
    }
    return NextResponse.redirect(`${origin}/login?message=${encodeURIComponent('로그인 링크를 확인하지 못했어요. 다시 시도해 주세요.')}`)
}
