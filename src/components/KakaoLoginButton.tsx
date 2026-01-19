"use client"

import { createClient } from "@/utils/supabase/client"

export default function KakaoLoginButton() {
    const handleLogin = async () => {
        const supabase = createClient()
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "kakao",
            options: {
                redirectTo: `${location.origin}/auth/callback`,
                scopes: '', // 이 부분을 비워두면 기본 권한만 요청하게 됩니다.
            },
        })

        if (error) {
            console.error("Kakao login error:", error)
        }
    }

    return (
        <button
            type="button"
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-2 rounded-md py-2 px-4 text-black bg-[#FEE500] hover:bg-[#FDD835] transition-colors font-medium border-none"
        >
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M12 3C5.9 3 1 6.6 1 11.2C1 14.2 2.9 16.9 5.8 18.2L4.7 22.2C4.6 22.6 5 22.9 5.3 22.7L9.9 19.6C10.6 19.7 11.3 19.8 12 19.8C18.1 19.8 23 16.2 23 11.6C23 6.6 18.1 3 12 3Z"
                />
            </svg>
            Login with Kakao
        </button>
    )
}
