"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Sparkles } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

/**
 * 시험지 상세페이지의 '무료 문제 PDF' CTA.
 * - 비로그인/크롤러(기본): 혜택 강조 + 회원가입 CTA (전환 유도).
 * - 로그인: 워터마크 없는 문제 PDF 즉시 다운로드.
 * 페이지는 ISR 정적 캐시라 로그인 여부는 클라이언트에서 판별한다.
 */
export default function FreeProblemCTA({ freePdfUrl, filename, pageCount }: { freePdfUrl: string; filename: string; pageCount: number }) {
    const [authed, setAuthed] = useState<boolean | null>(null);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user)).catch(() => setAuthed(false));
    }, []);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const res = await fetch(freePdfUrl);
            if (!res.ok) throw new Error(`status ${res.status}`);
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.setAttribute('download', filename);
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            alert('무료 문제 PDF를 준비 중입니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl border-2 border-emerald-200 shadow-sm p-5 sm:p-6 mb-6">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs font-extrabold px-2.5 py-1 rounded-full">
                    <Sparkles size={13} /> 무료
                </span>
                <p className="font-extrabold text-slate-900 text-lg break-keep">문제 전체 PDF · 워터마크 없음</p>
            </div>
            <p className="text-sm text-slate-600 break-keep mb-4">
                회원가입만 하면 위 미리보기의{' '}
                <strong className="text-emerald-700">워터마크 없는 깨끗한 문제 PDF{pageCount > 0 ? ` (${pageCount}페이지)` : ''}</strong>
                를 무료로 받을 수 있어요. <span className="text-slate-400">(해설은 별도 제공)</span>
            </p>

            {authed ? (
                <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold px-6 py-3 rounded-xl transition-colors disabled:opacity-60"
                >
                    <Download size={18} /> {downloading ? '받는 중…' : '문제 PDF 무료 다운로드'}
                </button>
            ) : (
                <>
                    <Link
                        href="/signup"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold px-6 py-3 rounded-xl transition-colors shadow-sm shadow-emerald-500/25"
                    >
                        <Sparkles size={18} /> 무료 회원가입하고 깨끗한 PDF 받기
                    </Link>
                    {authed === false && (
                        <p className="text-xs text-slate-400 mt-2.5">
                            이미 회원이신가요?{' '}
                            <Link href="/login" className="text-emerald-600 font-bold hover:underline">로그인</Link>
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
