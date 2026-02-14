"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { X, Upload, FileText, CheckCircle2, AlertCircle, FileDown, Database } from 'lucide-react';
import { PdfFileIcon, HwpFileIcon } from './FileIcons';
import { updateExamMaterial } from '@/app/mypage/actions';

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
    const [contentType, setContentType] = useState<'문제' | '해설'>('해설');

    // New File State (if replacing)
    const [newFile, setNewFile] = useState<File | null>(null);

    const [isUploading, setIsUploading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const subjects = ['공통수학1', '공통수학2', '대수', '미적분1', '기하', '확통', '미적분2'];

    // Updated Prices (Constants from UploadModal)
    const PRICE_PDF_SOL = 1000;
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
            setTitle(fileData.title?.replace(' [문제]', '')?.replace(' [문제+해설]', '') || '');
            setFileType(fileData.file_type || 'PDF');
            setContentType(fileData.content_type || '해설'); // Default to '해설' (integrated)
            setNewFile(null);
            setErrorMsg('');
        }
    }, [isOpen, fileData]);

    if (!isOpen) return null;

    const currentPrice = fileType === 'PDF' ? PRICE_PDF_SOL : PRICE_HWP_SOL;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            setNewFile(f);

            // Auto-detect type
            const ext = f.name.split('.').pop()?.toLowerCase();
            if (ext === 'pdf') setFileType('PDF');
            else if (['hwp', 'hwpx', 'hml'].includes(ext || '')) setFileType('HWP');
        }
    };

    const generateTitle = () => {
        if (selectedSchool) {
            setTitle(`${selectedSchool} ${year}년 ${grade}학년 ${semester}학기 ${examType} ${subject}`);
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

            if (newFile) {
                const fileExt = newFile.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const newPath = `${user.id}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('exam-materials')
                    .upload(newPath, newFile);

                if (uploadError) throw uploadError;
                filePath = newPath;
            }

            // Sync title suffix: Modern label is [문제+해설]
            const titleSuffix = ' [문제+해설]';

            const updates = {
                school: selectedSchool,
                region: selectedRegion,
                district: selectedDistrict,
                exam_year: Number(year),
                grade: Number(grade),
                semester: Number(semester),
                exam_type: examType,
                subject: subject,
                title: title + titleSuffix,
                file_type: fileType,
                content_type: '해설',
                file_path: filePath,
                price: currentPrice
            };

            // [V103] Use Server Action instead of direct client-side update to ensure cache invalidation (Home & MyPage)
            const result = await updateExamMaterial(fileData.id, updates);

            if (!result.success) {
                throw new Error(result.message);
            }

            alert('자료가 성공적으로 수정되었습니다!');
            onClose();
            // window.location.reload() is less necessary now because of revalidatePath, 
            // but keeps the current page fresh without full router navigation logic complexity
            window.location.reload();

        } catch (error: any) {
            console.error('Update failed:', error);
            setErrorMsg(error.message || '수정 중 오류가 발생했습니다.');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600">
                            <Database size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">자료 정보 수정</h2>
                            <p className="text-xs text-slate-500 font-medium">업로드된 자료의 메타데이터와 파일을 교체합니다.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-8">
                    {/* 1. School & Exam Info */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-[11px] font-bold">1</span>
                            학교 및 시험 정보
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 ml-1">시/도</label>
                                <select className="w-full rounded-lg border-slate-200 text-sm focus:border-brand-500 focus:ring-brand-500 transition-all"
                                    required
                                    value={selectedRegion}
                                    onChange={e => { setSelectedRegion(e.target.value); setSelectedDistrict(''); }}>
                                    <option value="">시/도 선택</option>
                                    {regions.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 ml-1">구/군</label>
                                <select className="w-full rounded-lg border-slate-200 text-sm focus:border-brand-500 focus:ring-brand-500 transition-all"
                                    required
                                    value={selectedDistrict}
                                    onChange={e => setSelectedDistrict(e.target.value)}
                                    disabled={!selectedRegion}>
                                    <option value="">구/군 선택</option>
                                    {districtsMap[selectedRegion]?.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 ml-1">학교</label>
                                <select className="w-full rounded-lg border-slate-200 text-sm focus:border-brand-500 focus:ring-brand-500 transition-all font-bold text-brand-700"
                                    required
                                    value={selectedSchool}
                                    onChange={e => setSelectedSchool(e.target.value)}
                                    disabled={!selectedDistrict}>
                                    <option value="">학교 선택</option>
                                    {schoolsMap[selectedRegion]?.[selectedDistrict]?.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 ml-1">연도</label>
                                <select value={year} onChange={e => setYear(Number(e.target.value))} className="w-full rounded-lg border-slate-200 text-sm">
                                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                                        <option key={y} value={y}>{y}년</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 ml-1">학년</label>
                                <select value={grade} onChange={e => setGrade(Number(e.target.value))} className="w-full rounded-lg border-slate-200 text-sm">
                                    <option value={1}>1학년</option>
                                    <option value={2}>2학년</option>
                                    <option value={3}>3학년</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 ml-1">학기</label>
                                <select value={semester} onChange={e => setSemester(Number(e.target.value))} className="w-full rounded-lg border-slate-200 text-sm">
                                    <option value={1}>1학기</option>
                                    <option value={2}>2학기</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 ml-1">시험</label>
                                <select value={examType} onChange={e => setExamType(e.target.value)} className="w-full rounded-lg border-slate-200 text-sm">
                                    <option value="중간고사">중간고사</option>
                                    <option value="기말고사">기말고사</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-1 space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 ml-1">과목</label>
                                <select value={subject} onChange={e => setSubject(e.target.value)} className="w-full rounded-lg border-slate-200 text-sm focus:border-brand-500 focus:ring-brand-500" required>
                                    <option value="">과목 선택</option>
                                    {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2 space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 ml-1 flex justify-between items-center">
                                    자료 제목
                                    <button type="button" onClick={generateTitle} className="text-[10px] text-brand-600 hover:underline">자동 완성</button>
                                </label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="상세 제목을 입력하세요"
                                    className="w-full rounded-lg border-slate-200 text-sm bg-slate-50 focus:bg-white focus:ring-brand-500 transition-all font-medium"
                                />
                            </div>
                        </div>
                    </div>

                    <hr className="border-slate-100" />

                    {/* 2. File Settings */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-[11px] font-bold">2</span>
                            파일 및 가격 설정
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-500 ml-1">자료 형식</label>
                                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                                    <button
                                        type="button"
                                        onClick={() => setFileType('PDF')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-lg transition-all ${fileType === 'PDF' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <PdfFileIcon size={16} /> PDF
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFileType('HWP')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-lg transition-all ${fileType === 'HWP' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <HwpFileIcon size={16} /> HWP / HML
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-500 ml-1">현재 설정 가격</label>
                                <div className="bg-brand-50 border border-brand-100 rounded-xl py-2 px-4 flex items-center justify-between h-[46px]">
                                    <span className="text-[10px] font-bold text-brand-600">수정 후 자동 할인 적용</span>
                                    <span className="text-lg font-black text-brand-600">{currentPrice.toLocaleString()}P</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[11px] font-bold text-slate-500 ml-1 flex justify-between">
                                파일 교체 (선택)
                                {fileData.file_path && <span className="text-[10px] text-slate-400 font-medium">기본 파일: {fileData.file_path.split('/').pop()}</span>}
                            </label>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-xl p-4 flex items-center justify-between cursor-pointer transition-all ${newFile ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-400 hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${newFile ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                        <Upload size={20} />
                                    </div>
                                    <div className="overflow-hidden max-w-[300px]">
                                        {newFile ? (
                                            <>
                                                <div className="text-sm font-bold text-brand-700 truncate">{newFile.name}</div>
                                                <div className="text-[10px] text-brand-500 font-medium">새 파일로 교체됩니다.</div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="text-sm font-bold text-slate-600">파일 변경하려면 클릭하세요</div>
                                                <div className="text-[10px] text-slate-400 font-medium">PDF, HWP, HWPX, HML 지원</div>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${newFile ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
                                >
                                    {newFile ? '변경' : '선택'}
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={fileType === 'PDF' ? ".pdf" : ".hwp,.hwpx,.hml"}
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            </div>
                        </div>
                    </div>

                    {errorMsg && (
                        <div className="bg-red-50 border border-red-100 text-red-600 text-xs p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
                            <AlertCircle size={18} className="flex-shrink-0" />
                            <p className="font-medium">{errorMsg}</p>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="pt-2 flex justify-end gap-3 border-t border-slate-100 pt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors"
                            disabled={isUploading}
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            disabled={isUploading}
                            className="px-10 py-3 text-sm font-bold text-white bg-brand-600 rounded-xl shadow-lg shadow-brand-200 hover:bg-brand-700 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2"
                        >
                            {isUploading ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    저장 중...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={16} />
                                    수정 완료
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
