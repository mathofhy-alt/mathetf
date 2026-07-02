import Link from "next/link"
import { login } from "./actions"
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
        <div className="min-h-screen flex">
            {/* ── 왼쪽: 브랜드 영역 ── */}
            <div
                className="hidden lg:flex flex-col justify-between w-[52%] p-12 relative overflow-hidden"
                style={{
                    background: 'linear-gradient(135deg, #1a3a6e 0%, #2d5fa8 50%, #3b82c4 100%)',
                }}
            >
                {/* 배경 장식 원들 */}
                <div className="absolute top-[-80px] right-[-80px] w-72 h-72 rounded-full opacity-10"
                    style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }} />
                <div className="absolute bottom-[-60px] left-[-60px] w-60 h-60 rounded-full opacity-10"
                    style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }} />
                <div className="absolute top-1/2 right-8 w-96 h-96 rounded-full opacity-5"
                    style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }} />

                {/* 로고 */}
                <div className="relative z-10">
                    <Link href="/" className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg">
                            <span className="text-[#2d5fa8] font-black text-2xl">∑</span>
                        </div>
                        <span className="text-white font-black text-2xl tracking-tight">수학ETF</span>
                    </Link>
                </div>

                {/* 중앙 카피 */}
                <div className="relative z-10 flex-1 flex flex-col justify-center">
                    <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-2 text-white/90 text-sm font-bold mb-6 w-fit">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        전국 내신 기출 플랫폼
                    </div>
                    <h1 className="text-4xl xl:text-5xl font-black text-white leading-tight mb-4">
                        내신 기출,<br />
                        <span className="text-sky-300">한 곳에서</span><br />
                        해결하세요
                    </h1>
                    <p className="text-white/70 text-base leading-relaxed mb-10 max-w-sm">
                        전국 고등학교 시험지를 PDF·HWP로 즉시 다운로드하고,
                        나만의 맞춤 시험지도 만들어보세요.
                    </p>

                    {/* 혜택 목록 */}
                    <div className="space-y-3">
                        {[
                            { icon: '📄', text: '전국 내신 기출 PDF·HWP 즉시 다운로드' },
                            { icon: '📝', text: '개인 맞춤 시험지 출제 기능' },
                            { icon: '🎁', text: '자료 업로드 시 포인트 적립' },
                        ].map((item, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-base shrink-0">
                                    {item.icon}
                                </div>
                                <span className="text-white/85 text-sm font-medium">{item.text}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 하단 문구 */}
                <div className="relative z-10">
                    <p className="text-white/40 text-xs">© 2026 수학ETF. All rights reserved.</p>
                </div>
            </div>

            {/* ── 오른쪽: 폼 영역 ── */}
            <div className="flex-1 flex flex-col justify-center items-center bg-[#F8FAFD] px-6 py-12 lg:px-16">

                {/* 모바일 로고 */}
                <div className="lg:hidden mb-8 flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-[#2d5fa8] rounded-2xl flex items-center justify-center shadow-lg">
                        <span className="text-white font-black text-3xl">∑</span>
                    </div>
                    <span className="text-[#2d5fa8] font-black text-xl tracking-tight">수학ETF</span>
                </div>

                <div className="w-full max-w-sm">
                    {/* 헤더 */}
                    <div className="mb-8">
                        <h2 className="text-2xl font-black text-slate-800 mb-1">로그인</h2>
                        <p className="text-slate-500 text-sm">계속하려면 로그인해 주세요.</p>
                    </div>

                    {/* 폼 */}
                    <form className="flex flex-col gap-5" action={signIn}>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-bold text-slate-700" htmlFor="email">
                                이메일
                            </label>
                            <input
                                id="email"
                                className="w-full rounded-xl px-4 py-3 bg-white border border-slate-200 text-sm focus:border-[#2d5fa8] focus:outline-none focus:ring-2 focus:ring-[#2d5fa8]/15 transition-all placeholder:text-slate-400"
                                name="email"
                                type="email"
                                placeholder="you@example.com"
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-bold text-slate-700" htmlFor="password">
                                비밀번호
                            </label>
                            <input
                                id="password"
                                className="w-full rounded-xl px-4 py-3 bg-white border border-slate-200 text-sm focus:border-[#2d5fa8] focus:outline-none focus:ring-2 focus:ring-[#2d5fa8]/15 transition-all placeholder:text-slate-400"
                                type="password"
                                name="password"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <div className="flex justify-end">
                            <Link href="/find-id" className="text-xs text-[#2d5fa8] font-bold hover:underline">
                                아이디 · 비밀번호 찾기
                            </Link>
                        </div>

                        <button
                            type="submit"
                            className="w-full py-3.5 bg-[#2d5fa8] text-white font-extrabold text-base rounded-xl hover:bg-[#1a3a6e] transition-colors shadow-md shadow-[#2d5fa8]/20 active:scale-[.98]"
                        >
                            로그인
                        </button>
                    </form>

                    {/* 구분선 */}
                    <div className="flex items-center gap-3 my-5">
                        <div className="flex-1 h-px bg-slate-200" />
                        <span className="text-xs text-slate-400 font-medium">또는</span>
                        <div className="flex-1 h-px bg-slate-200" />
                    </div>

                    {/* 회원가입 버튼 */}
                    <Link
                        href="/signup"
                        className="block w-full py-3.5 border-2 border-slate-200 text-slate-600 font-bold text-sm text-center rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors"
                    >
                        계정이 없으신가요? <span className="text-[#2d5fa8]">무료 회원가입</span>
                    </Link>

                    {/* 에러 메시지 */}
                    {searchParams?.message && (
                        <>
                            <LoginAlert message={searchParams.message} />
                            <p className="mt-4 p-4 bg-red-50 text-red-600 font-bold text-sm text-center rounded-xl border border-red-100">
                                {searchParams.message}
                            </p>
                        </>
                    )}

                    {/* 뒤로가기 */}
                    <div className="mt-8 text-center">
                        <Link href="/" className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            홈으로 돌아가기
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
