import Link from "next/link"
import { headers } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { login } from "./actions"
import KakaoLoginButton from "@/components/KakaoLoginButton"
import LoginAlert from "@/components/LoginAlert"

export default function Login({
    searchParams,
}: {
    searchParams: { message: string }
}) {
    const signIn = async (formData: FormData) => {
        "use server"
        await login(formData)
    }

    return (
        <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 mx-auto min-h-screen">
            <Link
                href="/"
                className="absolute left-8 top-8 py-2 px-4 rounded-md no-underline text-foreground bg-btn-background hover:bg-btn-background-hover flex items-center group text-sm"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1"
                >
                    <polyline points="15 18 9 12 15 6" />
                </svg>
                뒤로가기
            </Link>

            <form
                className="animate-in flex-1 flex flex-col w-full justify-center gap-2 text-foreground"
                action={signIn}
            >
                <KakaoLoginButton />

                <div className="flex items-center gap-2 my-4">
                    <div className="h-[1px] bg-foreground/10 flex-1"></div>
                    <span className="text-sm text-foreground/50">또는</span>
                    <div className="h-[1px] bg-foreground/10 flex-1"></div>
                </div>

                <label className="text-md" htmlFor="email">
                    이메일
                </label>
                <input
                    className="rounded-md px-4 py-2 bg-inherit border mb-6"
                    name="email"
                    placeholder="you@example.com"
                    required
                />
                <label className="text-md" htmlFor="password">
                    비밀번호
                </label>
                <input
                    className="rounded-md px-4 py-2 bg-inherit border mb-6"
                    type="password"
                    name="password"
                    placeholder="••••••••"
                    required
                />
                <button className="bg-green-700 rounded-md px-4 py-2 text-white mb-2 font-bold">
                    로그인
                </button>
                <Link
                    href="/signup"
                    className="border border-foreground/20 rounded-md px-4 py-2 text-foreground mb-2 font-bold text-center hover:bg-foreground/5 transition-colors"
                >
                    회원가입
                </Link>
                {searchParams?.message && (
                    <>
                        <LoginAlert message={searchParams.message} />
                        <p className="mt-4 p-4 bg-red-100 text-red-600 font-bold text-center rounded-md">
                            {searchParams.message}
                        </p>
                    </>
                )}
            </form>
        </div>
    )
}
