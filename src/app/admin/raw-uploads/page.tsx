'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { FileDown, Calendar, School, User as UserIcon, Trash2 } from 'lucide-react';

export default function RawUploadsAdmin() {
    const supabase = createClient();
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [uploads, setUploads] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || user.email !== 'mathofhy@naver.com') {
                router.push('/');
                return;
            }
            setUser(user);

            const { data, error } = await supabase
                .from('exam_materials')
                .select('*')
                .eq('content_type', '원본제보')
                .order('created_at', { ascending: false });
                
            if (!error && data) {
                setUploads(data);
            }
            setIsLoading(false);
        };
        init();
    }, [router, supabase]);

    const handleDownload = async (filePath: string, originalTitle: string) => {
        try {
            const { data, error } = await supabase.storage
                .from('exam-materials')
                .createSignedUrl(filePath, 60);

            if (error) throw error;
            if (data?.signedUrl) {
                // Trigger download
                const a = document.createElement('a');
                a.href = data.signedUrl;
                a.download = originalTitle;
                document.body.appendChild(a);
                a.click();
                a.remove();
            }
        } catch (err) {
            console.error('Download failed:', err);
            alert('다운로드에 실패했습니다. 해당 파일이 Storage에 존재하지 않을 수 있습니다.');
        }
    };

    const handleDelete = async (id: string, filePath: string) => {
        if (!confirm('이 파일을 스토리지와 DB에서 영구 삭제하시겠습니까? (삭제 후 복구 불가)')) return;
        
        try {
            // 1. Delete from Storage
            const { error: storageError } = await supabase.storage
                .from('exam-materials')
                .remove([filePath]);
                
            if (storageError) {
                console.error('Storage deletion error:', storageError);
                // Attempt DB deletion anyway to avoid orphan records, but maybe warn?
            }

            // 2. Delete from Database
            const { error: dbError } = await supabase
                .from('exam_materials')
                .delete()
                .eq('id', id);

            if (dbError) throw dbError;

            // 3. Update UI
            setUploads(uploads.filter(u => u.id !== id));
            alert('성공적으로 삭제되었습니다. (서버 용량 확보됨)');

        } catch (err) {
            console.error('Delete failed:', err);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
            <Header user={user} />
            <main className="max-w-[1200px] mx-auto px-4 py-8">
                <div className="mb-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                        📥 유저 제보 족보(원본) 확인
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">사용자들이 '자료등록 - 원본 시험지 제보' 탭을 통해 업로드한 파일 목록입니다.</p>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                    {isLoading ? (
                        <div className="p-20 text-center text-slate-400 font-bold animate-pulse text-lg">데이터를 스캔하는 중입니다...</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100 border-b border-slate-200">
                                <tr>
                                    <th className="py-3 px-4 text-left font-extrabold text-slate-700">제보 일시</th>
                                    <th className="py-3 px-4 text-left font-extrabold text-slate-700">학교 / 시험</th>
                                    <th className="py-3 px-4 text-left font-extrabold text-slate-700">제보자 ID / 이름</th>
                                    <th className="py-3 px-4 text-center font-extrabold text-slate-700">관리 (다운/삭제)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {uploads.map(file => (
                                    <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap text-xs">
                                            <div className="flex items-center gap-1.5"><Calendar size={14}/> {new Date(file.created_at).toLocaleString('ko-KR')}</div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="font-bold text-slate-800 flex items-center gap-1.5"><School size={14}/> {file.school}</div>
                                            <div className="text-xs text-slate-500 mt-0.5">{file.exam_year}년도 {file.grade}학년 {file.semester === 1 ? '1학기' : '2학기'} {file.exam_type} ({file.subject})</div>
                                            <div className="text-xs text-brand-600 mt-0.5">{file.title}</div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="font-bold text-slate-700 flex items-center gap-1.5"><UserIcon size={14}/> {file.uploader_name || '익명'}</div>
                                            <div className="text-xs text-slate-400 mt-0.5 font-mono">{file.uploader_id}</div>
                                        </td>
                                        <td className="py-3 px-4 text-center flex items-center justify-center gap-2">
                                            <button 
                                                onClick={() => handleDownload(file.file_path, file.title)}
                                                title="다운로드"
                                                className="inline-flex items-center justify-center p-2 bg-brand-50 text-brand-600 hover:bg-brand-600 hover:text-white rounded-lg transition-colors shadow-sm"
                                            >
                                                <FileDown size={16} />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(file.id, file.file_path)}
                                                title="완전 삭제 (서버 용량 확보)"
                                                className="inline-flex items-center justify-center p-2 bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg transition-colors shadow-sm"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {uploads.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="py-20 text-center text-slate-500 font-medium">제보된 파일이 없습니다.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </main>
        </div>
    );
}
