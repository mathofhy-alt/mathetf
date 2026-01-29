"use client";

import React, { useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { X, Upload, FileText, Trash2, CheckCircle2, AlertCircle, FileDown, Database } from 'lucide-react';
import { PdfFileIcon, HwpFileIcon } from './FileIcons';

interface UploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any; // Supabase user
    regions: string[];
    districtsMap: Record<string, string[]>;
    schoolsMap: Record<string, Record<string, string[]>>;
}

export default function UploadModal({ isOpen, onClose, user, regions, districtsMap, schoolsMap }: UploadModalProps) {
    const supabase = createClient();
    const router = useRouter();

    // Refs for file inputs
    const pdfSolRef = useRef<HTMLInputElement>(null);
    const hwpSolRef = useRef<HTMLInputElement>(null);

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

    // New State for Template Compliance
    const [isTemplateCompliant, setIsTemplateCompliant] = useState(false);

    // File States
    const [filePdfSol, setFilePdfSol] = useState<File | null>(null);
    const [fileHwpSol, setFileHwpSol] = useState<File | null>(null);


    // Validations & Loading
    const [isUploading, setIsUploading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const subjects = ['공통수학1', '공통수학2', '대수', '미적분1', '기하', '확통', '미적분2'];

    if (!isOpen) return null;

    // Prices (Updated based on user request)
    const PRICE_PDF_SOL = 1000;
    const PRICE_HWP_SOL = 2000;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setFile: React.Dispatch<React.SetStateAction<File | null>>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            // Auto-generate title if empty and school is selected
            if (!title && selectedSchool) {
                generateTitle();
            }
        }
    };

    const generateTitle = () => {
        if (selectedSchool) {
            setTitle(`${selectedSchool} ${year}년 ${grade}학년 ${semester}학기 ${examType} ${subject}`);
        }
    };

    const uploadSingleFile = async (file: File, fileType: 'PDF' | 'HWP', contentType: '문제' | '해설', price: number) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        // 1. Storage Upload
        const { error: uploadError } = await supabase.storage
            .from('exam-materials')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. DB Insert
        // Adjust title suffix based on contentType to match the new labels if "해설" implies "문+해"
        let titleSuffix = ' [문제]';
        if (contentType === '해설') {
            titleSuffix = ' [문제+해설]';
        }

        const { error: dbError } = await supabase.from('exam_materials').insert({
            uploader_id: user.id,
            uploader_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Unknown',
            school: selectedSchool,
            region: selectedRegion,
            district: selectedDistrict,
            // year column missing in DB, relying on title regex fallback
            grade: Number(grade),
            semester: Number(semester),
            exam_type: examType,
            subject: subject,
            title: title + titleSuffix,
            file_type: fileType,
            content_type: contentType,
            file_path: filePath,
            price: price,
            sales_count: 0
        });

        if (dbError) throw dbError;
    };



    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setIsUploading(true);

        try {
            if (!selectedSchool) throw new Error('학교를 선택해주세요.');
            if (!subject) throw new Error('과목을 선택해주세요.');
            if (!title) throw new Error('제목을 입력해주세요.');

            // Check if at least one file is selected
            if (!filePdfSol && !fileHwpSol) {
                throw new Error('최소한 하나의 파일(PDF 또는 HWP)을 등록해야 합니다.');
            }

            const uploads = [];

            if (filePdfSol) uploads.push(uploadSingleFile(filePdfSol, 'PDF', '해설', PRICE_PDF_SOL));
            if (fileHwpSol) uploads.push(uploadSingleFile(fileHwpSol, 'HWP', '해설', PRICE_HWP_SOL));

            await Promise.all(uploads);

            alert('자료가 성공적으로 등록되었습니다!');
            onClose();
            router.refresh();
            window.location.reload();

        } catch (error: any) {
            console.error('Upload failed:', error);
            setErrorMsg(error.message || '업로드 중 오류가 발생했습니다.');
        } finally {
            setIsUploading(false);
        }
    };

    const FileUploadSlot = ({
        label,
        subLabel,
        file,
        setFile,
        accept,
        price,
        inputRef,
        Icon
    }: {
        label: string,
        subLabel: string,
        file: File | null,
        setFile: React.Dispatch<React.SetStateAction<File | null>>,
        accept: string,
        price: number,
        inputRef: React.RefObject<HTMLInputElement>,
        Icon: React.ElementType
    }) => (
        <div className={`border rounded-lg p-3 flex flex-col gap-2 transition-all ${file ? 'border-brand-200 bg-brand-50' : 'border-slate-200 hover:border-brand-300'}`}>
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                    <Icon size={20} />
                    <div>
                        <div className="text-sm font-bold text-slate-700">{label}</div>
                        <div className="text-[10px] text-slate-500">{subLabel}</div>
                    </div>
                </div>
                <div className="text-xs font-bold text-brand-600 bg-brand-100 px-2 py-0.5 rounded">
                    {price}P
                </div>
            </div>

            {file ? (
                <div className="flex items-center justify-between bg-white rounded border border-brand-200 p-2 mt-1">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                        <span className="text-xs text-slate-700 truncate">{file.name}</span>
                    </div>
                    <button type="button" onClick={() => setFile(null)} className="text-slate-400 hover:text-red-500">
                        <Trash2 size={14} />
                    </button>
                </div>
            ) : (
                <div
                    onClick={() => inputRef.current?.click()}
                    className="mt-1 border-2 border-dashed border-slate-200 hover:border-brand-300 hover:bg-white rounded h-10 flex items-center justify-center cursor-pointer transition-colors"
                >
                    <span className="text-xs text-slate-400">+ 파일 추가</span>
                </div>
            )}
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={(e) => handleFileChange(e, setFile)}
            />
        </div>
    );



    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800">자료 등록</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-8">
                    {/* Template Download Section */}
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <h3 className="font-bold text-blue-900 flex items-center gap-2">
                                    <FileText size={18} />
                                    필수 양식 다운로드
                                </h3>
                                <p className="text-xs text-blue-700 font-medium">
                                    반드시 제공된 양식을 준수하여 작성해주세요.<br className="hidden sm:block" />
                                    양식 미준수 시 자료 판매가 중지될 수 있습니다.
                                </p>
                            </div>
                            <a
                                href="/files/standard_template.hwp"
                                download
                                className="flex items-center gap-2 bg-white text-blue-600 border border-blue-200 px-4 py-2 rounded-md text-sm font-bold hover:bg-blue-50 transition-colors shadow-sm whitespace-nowrap"
                            >
                                <FileDown size={16} />
                                수학ETF 표준 양식 다운로드(.hwp)
                            </a>
                        </div>
                    </div>

                    {/* 1. School Info */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold">1</span>
                            학교 및 시험 정보
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <select className="form-select w-full rounded border-slate-200 text-sm focus:border-brand-500 focus:ring-brand-500"
                                required
                                value={selectedRegion}
                                onChange={e => { setSelectedRegion(e.target.value); setSelectedDistrict(''); }}>
                                <option value="">시/도 선택</option>
                                {regions.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <select className="form-select w-full rounded border-slate-200 text-sm focus:border-brand-500 focus:ring-brand-500"
                                required
                                value={selectedDistrict}
                                onChange={e => setSelectedDistrict(e.target.value)}
                                disabled={!selectedRegion}>
                                <option value="">구/군 선택</option>
                                {districtsMap[selectedRegion]?.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                            <select className="form-select w-full rounded border-slate-200 text-sm focus:border-brand-500 focus:ring-brand-500"
                                required
                                value={selectedSchool}
                                onChange={e => { setSelectedSchool(e.target.value); if (!title) generateTitle(); }}
                                disabled={!selectedDistrict}>
                                <option value="">학교 선택</option>
                                {schoolsMap[selectedRegion]?.[selectedDistrict]?.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <select value={year} onChange={e => setYear(Number(e.target.value))} className="w-full rounded border-slate-200 text-sm focus:border-brand-500 focus:ring-brand-500">
                                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                                    <option key={y} value={y}>{y}년</option>
                                ))}
                            </select>
                            <select value={grade} onChange={e => setGrade(Number(e.target.value))} className="w-full rounded border-slate-200 text-sm focus:border-brand-500 focus:ring-brand-500">
                                <option value={1}>1학년</option>
                                <option value={2}>2학년</option>
                                <option value={3}>3학년</option>
                            </select>
                            <select value={semester} onChange={e => setSemester(Number(e.target.value))} className="w-full rounded border-slate-200 text-sm focus:border-brand-500 focus:ring-brand-500">
                                <option value={1}>1학기</option>
                                <option value={2}>2학기</option>
                            </select>
                            <select value={examType} onChange={e => setExamType(e.target.value)} className="w-full rounded border-slate-200 text-sm focus:border-brand-500 focus:ring-brand-500">
                                <option value="중간고사">중간고사</option>
                                <option value="기말고사">기말고사</option>
                            </select>
                            <select value={subject} onChange={e => { setSubject(e.target.value); if (title) generateTitle(); }} className="w-full rounded border-slate-200 text-sm focus:border-brand-500 focus:ring-brand-500" required>
                                <option value="">과목 선택</option>
                                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <div className="pt-2">
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="제목 (학교 선택 시 자동 생성됨)"
                                className="w-full rounded border-slate-200 text-sm bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-brand-500 transition-colors"
                            />
                        </div>
                    </div>

                    <hr className="border-slate-100" />

                    {/* 2. Files Upload */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold">2</span>
                            파일 및 DB 등록
                            <span className="text-[10px] font-normal text-slate-500 ml-2">* 최소 1개 이상의 항목을 등록해주세요.</span>
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FileUploadSlot
                                label="PDF 문제+해설"
                                subLabel="문제와 해설이 포함된 파일"
                                file={filePdfSol}
                                setFile={setFilePdfSol}
                                accept=".pdf"
                                price={PRICE_PDF_SOL}
                                inputRef={pdfSolRef}
                                Icon={PdfFileIcon}
                            />
                            <FileUploadSlot
                                label="HWP/HML 문제+해설"
                                subLabel="문제와 해설이 포함된 파일"
                                file={fileHwpSol}
                                setFile={setFileHwpSol}
                                accept=".hwp,.hwpx,.hml"
                                price={PRICE_HWP_SOL}
                                inputRef={hwpSolRef}
                                Icon={HwpFileIcon}
                            />

                        </div>
                    </div>

                    {errorMsg && (
                        <div className="bg-red-50 text-red-600 text-sm p-3 rounded flex items-center gap-2 animate-pulse">
                            <AlertCircle size={16} />
                            {errorMsg}
                        </div>
                    )}

                    {/* Template Compliance Checkbox */}
                    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded border border-slate-200">
                        <input
                            type="checkbox"
                            id="template-compliance"
                            checked={isTemplateCompliant}
                            onChange={(e) => setIsTemplateCompliant(e.target.checked)}
                            className="w-5 h-5 accent-brand-600 cursor-pointer"
                        />
                        <label htmlFor="template-compliance" className="text-sm font-bold text-slate-700 cursor-pointer select-none">
                            수학ETF 전용 양식을 사용하여 작성하였습니다 <span className="text-rose-500">(필수)</span>
                        </label>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-2 flex justify-end gap-3 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded transition-colors"
                            disabled={isUploading}
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            disabled={isUploading || !isTemplateCompliant}
                            className={`px-8 py-2.5 text-sm font-bold text-white bg-brand-600 rounded shadow-md hover:bg-brand-700 hover:shadow-lg transition-all flex items-center gap-2 ${isUploading || !isTemplateCompliant ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {isUploading ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    업로드 중...
                                </>
                            ) : (
                                <>
                                    <Upload size={16} />
                                    모두 등록하기
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

