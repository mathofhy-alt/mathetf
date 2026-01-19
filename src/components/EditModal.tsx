"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { X, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { PdfFileIcon, HwpFileIcon } from './FileIcons';

interface EditModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    fileData: any; // The file record to edit
    regions: string[];
    districtsMap: Record<string, string[]>;
    schoolsMap: Record<string, Record<string, string[]>>;
}

export default function EditModal({ isOpen, onClose, user, fileData, regions, districtsMap, schoolsMap }: EditModalProps) {
    const supabase = createClient();
    const router = useRouter();

    // Refs
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form State
    const [selectedRegion, setSelectedRegion] = useState('');
    const [selectedDistrict, setSelectedDistrict] = useState('');
    const [selectedSchool, setSelectedSchool] = useState('');

    const [year, setYear] = useState(new Date().getFullYear());
    const [grade, setGrade] = useState(1);
    const [semester, setSemester] = useState(1);
    const [examType, setExamType] = useState('중간고사');
    const [subject, setSubject] = useState('');
    const [title, setTitle] = useState('');

    const [fileType, setFileType] = useState<'PDF' | 'HWP'>('PDF');
    const [contentType, setContentType] = useState<'문제' | '해설'>('문제'); // '해설' implies '문제+해설' in some contexts, keeping consistent with UploadModal logic where '해설' -> PRICE_..._SOL

    // New File State (if replacing)
    const [newFile, setNewFile] = useState<File | null>(null);

    const [isUploading, setIsUploading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const subjects = ['공통수학1', '공통수학2', '대수', '미적분1', '기하', '확통', '미적분2'];

    // Prices (Constants from UploadModal)
    const PRICE_PDF_PROB = 500;
    const PRICE_PDF_SOL = 1000;
    const PRICE_HWP_PROB = 1500;
    const PRICE_HWP_SOL = 2000;

    useEffect(() => {
        if (isOpen && fileData) {
            setSelectedRegion(fileData.region || '');
            setSelectedDistrict(fileData.district || '');
            setSelectedSchool(fileData.school || '');
            setYear(fileData.exam_year || new Date().getFullYear());
            setGrade(fileData.grade || 1);
            setSemester(fileData.semester || 1);
            setExamType(fileData.exam_type || '중간고사');
            setSubject(fileData.subject || '');
            setTitle(fileData.title || '');
            setFileType(fileData.file_type || 'PDF');
            setContentType(fileData.content_type || '문제');
            setNewFile(null); // Reset new file
            setErrorMsg('');
        }
    }, [isOpen, fileData]);

    if (!isOpen) return null;

    // Calculate current price based on selection
    const currentPrice =
        fileType === 'PDF'
            ? (contentType === '문제' ? PRICE_PDF_PROB : PRICE_PDF_SOL)
            : (contentType === '문제' ? PRICE_HWP_PROB : PRICE_HWP_SOL);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            setNewFile(f);

            // Auto-detect type
            const ext = f.name.split('.').pop()?.toLowerCase();
            if (ext === 'pdf') setFileType('PDF');
            else if (ext === 'hwp' || ext === 'hwpx') setFileType('HWP');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setIsUploading(true);

        try {
            if (!selectedSchool) throw new Error('학교를 선택해주세요.');
            if (!subject) throw new Error('과목을 선택해주세요.');
            if (!title) throw new Error('제목을 입력해주세요.');

            let filePath = fileData.file_path;

            // 1. If new file is selected, upload it
            if (newFile) {
                const fileExt = newFile.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const newPath = `${user.id}/${fileName}`;

                // Upload
                const { error: uploadError } = await supabase.storage
                    .from('exam-materials')
                    .upload(newPath, newFile);

                if (uploadError) throw uploadError;

                filePath = newPath;
                // Note: We are not deleting the old file to avoid breaking purchased links if any, 
                // though strictly we might want to cleanup. For now, keep it safe.
            }

            // 2. Update DB
            const updates = {
                school: selectedSchool,
                region: selectedRegion,
                district: selectedDistrict,
                exam_year: Number(year),
                grade: Number(grade),
                semester: Number(semester),
                exam_type: examType,
                subject: subject,
                title: title,
                file_type: fileType,
                content_type: contentType,
                file_path: filePath,
                price: currentPrice
                // uploader_id, created_at, sales_count remain unchanged
            };

            const { error: dbError } = await supabase
                .from('exam_materials')
                .update(updates)
                .eq('id', fileData.id);

            if (dbError) throw dbError;

            alert('자료가 성공적으로 수정되었습니다!');
            onClose();
            router.refresh(); // Refresh Next.js data
            window.location.reload(); // Hard reload to ensure list updates

        } catch (error: any) {
            console.error('Update failed:', error);
            setErrorMsg(error.message || '수정 중 오류가 발생했습니다.');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800">자료 수정</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* School Info */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-800 text-sm">학교 및 시험 정보</h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <select className="form-select w-full rounded border-slate-200 text-sm"
                                required
                                value={selectedRegion}
                                onChange={e => { setSelectedRegion(e.target.value); setSelectedDistrict(''); }}>
                                <option value="">시/도 선택</option>
                                {regions.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <select className="form-select w-full rounded border-slate-200 text-sm"
                                required
                                value={selectedDistrict}
                                onChange={e => setSelectedDistrict(e.target.value)}
                                disabled={!selectedRegion}>
                                <option value="">구/군 선택</option>
                                {districtsMap[selectedRegion]?.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                            <select className="form-select w-full rounded border-slate-200 text-sm"
                                required
                                value={selectedSchool}
                                onChange={e => setSelectedSchool(e.target.value)}
                                disabled={!selectedDistrict}>
                                <option value="">학교 선택</option>
                                {schoolsMap[selectedRegion]?.[selectedDistrict]?.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <select value={year} onChange={e => setYear(Number(e.target.value))} className="w-full rounded border-slate-200 text-sm">
                                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                                    <option key={y} value={y}>{y}년</option>
                                ))}
                            </select>
                            <select value={grade} onChange={e => setGrade(Number(e.target.value))} className="w-full rounded border-slate-200 text-sm">
                                <option value={1}>1학년</option>
                                <option value={2}>2학년</option>
                                <option value={3}>3학년</option>
                            </select>
                            <select value={semester} onChange={e => setSemester(Number(e.target.value))} className="w-full rounded border-slate-200 text-sm">
                                <option value={1}>1학기</option>
                                <option value={2}>2학기</option>
                            </select>
                            <select value={examType} onChange={e => setExamType(e.target.value)} className="w-full rounded border-slate-200 text-sm">
                                <option value="중간고사">중간고사</option>
                                <option value="기말고사">기말고사</option>
                            </select>
                        </div>

                        <div>
                            <select value={subject} onChange={e => setSubject(e.target.value)} className="w-full rounded border-slate-200 text-sm" required>
                                <option value="">과목 선택</option>
                                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="제목"
                            className="w-full rounded border-slate-200 text-sm bg-slate-50 focus:bg-white"
                        />
                    </div>

                    <hr className="border-slate-100" />

                    {/* File Info */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-800 text-sm">파일 설정</h3>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1 space-y-2">
                                <label className="text-xs font-bold text-slate-500">파일 타입</label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setFileType('PDF')}
                                        className={`flex-1 py-2 text-sm font-bold rounded border ${fileType === 'PDF' ? 'bg-red-50 border-red-200 text-red-600' : 'border-slate-200 text-slate-500'}`}
                                    >
                                        PDF
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFileType('HWP')}
                                        className={`flex-1 py-2 text-sm font-bold rounded border ${fileType === 'HWP' ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-slate-200 text-slate-500'}`}
                                    >
                                        HWP
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 space-y-2">
                                <label className="text-xs font-bold text-slate-500">내용 포함</label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setContentType('문제')}
                                        className={`flex-1 py-2 text-sm font-bold rounded border ${contentType === '문제' ? 'bg-slate-800 text-white' : 'border-slate-200 text-slate-500'}`}
                                    >
                                        문제만
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setContentType('해설')}
                                        className={`flex-1 py-2 text-sm font-bold rounded border ${contentType === '해설' ? 'bg-slate-800 text-white' : 'border-slate-200 text-slate-500'}`}
                                    >
                                        문제+해설
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-600">설정 가격</span>
                            <span className="text-lg font-bold text-brand-600">{currentPrice}P</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-800">파일 변경 (선택)</label>
                        <div className={`border rounded-lg p-3 flex items-center justify-between ${newFile ? 'border-brand-300 bg-brand-50' : 'border-slate-200'}`}>
                            {newFile ? (
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 size={18} className="text-green-500" />
                                    <span className="text-sm text-slate-700">{newFile.name}</span>
                                </div>
                            ) : (
                                <div className="text-sm text-slate-400">변경할 파일을 선택하세요 (기존 파일 유지)</div>
                            )}
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="text-xs font-bold bg-white border border-slate-300 px-3 py-1.5 rounded hover:bg-slate-50"
                            >
                                파일 선택
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={fileType === 'PDF' ? ".pdf" : ".hwp,.hwpx"}
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </div>
                    </div>

                    {errorMsg && (
                        <div className="bg-red-50 text-red-600 text-sm p-3 rounded flex items-center gap-2">
                            <AlertCircle size={16} />
                            {errorMsg}
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="pt-2 flex justify-end gap-3 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded"
                            disabled={isUploading}
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            disabled={isUploading}
                            className="px-8 py-2.5 text-sm font-bold text-white bg-brand-600 rounded shadow-sm hover:bg-brand-700 flex items-center gap-2"
                        >
                            {isUploading ? '저장 중...' : '수정 완료'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
