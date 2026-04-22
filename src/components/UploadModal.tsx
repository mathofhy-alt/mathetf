"use client";

import React, { useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { X, Upload, FileText, Trash2, CheckCircle2, AlertCircle, FileDown, Database } from 'lucide-react';
import { PdfFileIcon, HwpFileIcon } from './FileIcons';

interface FileUploadSlotProps {
    id: string;
    label: string;
    subLabel: string;
    file: File | null;
    setFile: React.Dispatch<React.SetStateAction<File | null>>;
    accept: string;
    price: number;
    inputRef: React.RefObject<HTMLInputElement>;
    Icon: React.ElementType;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>, setFile: React.Dispatch<React.SetStateAction<File | null>>) => void;
}

const FileUploadSlot = ({
    id,
    label,
    subLabel,
    file,
    setFile,
    accept,
    price,
    Icon,
    onFileChange
}: Omit<FileUploadSlotProps, 'inputRef'>) => {
    
    // Completely detaches file picking from the React rendering cycle to prevent the "Windows Explorer immediate close" Chromium bug caused by SWR or state tracking re-renders.
    const handleProgrammaticClick = (e: React.MouseEvent) => {
        e.preventDefault();
        
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = accept;
        
        fileInput.onchange = (event: any) => {
            onFileChange(event, setFile);
        };
        
        fileInput.click();
    };

    return (
        <div className={`border rounded-lg p-3 flex flex-col gap-2 transition-all ${file ? 'border-brand-200 bg-brand-50' : 'border-slate-200 hover:border-brand-300'}`}>
            <div className="flex justify-between items-start gap-1">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                    <Icon size={20} className="shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-bold text-slate-700 tracking-tight whitespace-nowrap">{label}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 truncate">{subLabel}</div>
                    </div>
                </div>
                <div className="text-xs font-bold text-brand-600 bg-brand-100 px-2 py-0.5 rounded shrink-0">
                    {price}P
                </div>
            </div>

            {file ? (
                <div className="flex items-center justify-between bg-white rounded border border-brand-200 p-2 mt-1">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                        <span className="text-xs text-slate-700 truncate">{file.name}</span>
                    </div>
                    <button type="button" onClick={() => setFile(null)} className="text-slate-400 hover:text-red-500 z-10 relative">
                        <Trash2 size={14} />
                    </button>
                </div>
            ) : (
                <button 
                    type="button"
                    onClick={handleProgrammaticClick}
                    className="relative mt-1 border-2 border-dashed border-slate-200 hover:border-brand-300 hover:bg-white rounded h-10 w-full flex items-center justify-center cursor-pointer transition-colors overflow-hidden group"
                >
                    <span className="text-xs text-slate-400 pointer-events-none group-hover:text-brand-500 font-medium transition-colors">+ 파일 추가</span>
                </button>
            )}
        </div>
    );
};

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

    // Upload Type Toggle
    const [uploadType, setUploadType] = useState<'MARKET' | 'SHADOW'>('MARKET');

    // File States
    const [filePdfSol, setFilePdfSol] = useState<File | null>(null);
    const [fileHwpSol, setFileHwpSol] = useState<File | null>(null);
    const [fileRawCopy, setFileRawCopy] = useState<File | null>(null);


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
            const isMock = examType === '모의고사' || examType === '수능';
            const semLabel = isMock ? `${semester}월` : `${semester}학기`;
            setTitle(`${selectedSchool} ${year}년 ${grade}학년 ${semLabel} ${examType} ${subject}`);
        }
    };

    const checkDuplicate = async (fileType: 'PDF' | 'HWP', contentType: '문제' | '해설') => {
        // Build query to find match on metadata
        const { data, error } = await supabase
            .from('exam_materials')
            .select('id, title') // Select title to check year
            .eq('school', selectedSchool)
            .eq('grade', grade)
            .eq('semester', semester)
            .eq('exam_type', examType)
            .eq('subject', subject)
            .eq('file_type', fileType)
            .eq('content_type', contentType);

        if (error) throw error;

        if (!data || data.length === 0) return false;

        // Check if any existing item's title contains the selected year
        // Title format: "School Year Grade..." (e.g. "경기고 2024년 1학년...")
        const isDuplicateDate = data.some(item => item.title.includes(`${year}년`) || item.title.includes(String(year)));
        return isDuplicateDate;
    };

    const uploadSingleFile = async (file: File, fileType: 'PDF' | 'HWP', contentType: '문제' | '해설', price: number) => {
        // 0. Duplicate Check
        const isDuplicate = await checkDuplicate(fileType, contentType);
        if (isDuplicate) {
            throw new Error(`[중복] 이미 등록된 자료입니다 (${year}년): ${fileType} ${contentType}`);
        }

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
            uploader_name: user?.email?.split('@')[0] || user?.user_metadata?.full_name || 'Unknown',
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
            content_type: contentType,
            file_path: filePath,
            price: price,
            sales_count: 0
        });

        if (dbError) throw dbError;
    };

    const uploadRawSingleFile = async (file: File) => {
        // Shadow upload uses content_type = '원본제보'
        const fileExt = file.name.split('.').pop()?.toUpperCase() || 'FILE';
        const fileTypeForDb = fileExt === 'PDF' ? 'PDF' : (['JPG','PNG','JPEG'].includes(fileExt) ? 'IMAGE' : fileExt);
        
        const fileName = `${Date.now()}_raw_${Math.random().toString(36).substring(7)}.${fileExt.toLowerCase()}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage.from('exam-materials').upload(filePath, file);
        if (uploadError) throw uploadError;

        const displayName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Unknown';

        const { error: dbError } = await supabase.from('exam_materials').insert({
            uploader_id: user.id,
            uploader_name: displayName,
            submitter_id: user.id,
            submitter_name: displayName,
            school: selectedSchool,
            region: selectedRegion,
            district: selectedDistrict,
            exam_year: Number(year),
            grade: Number(grade),
            semester: Number(semester),
            exam_type: examType,
            subject: subject,
            title: title + ' [원본제보]',
            file_type: fileTypeForDb,
            content_type: '원본제보',
            file_path: filePath,
            price: 0,
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

            if (uploadType === 'MARKET') {
                if (!filePdfSol || !fileHwpSol) {
                    throw new Error('PDF와 HWP/HML 파일을 모두 등록해야 합니다.');
                }
                // Upload sequentially to prevent overloading the server or hitting payload limits
                await uploadSingleFile(filePdfSol, 'PDF', '해설', PRICE_PDF_SOL);
                await uploadSingleFile(fileHwpSol, 'HWP', '해설', PRICE_HWP_SOL);
            } else {
                if (!fileRawCopy) {
                    throw new Error('원본 시험지 파일(PDF, 사진)을 첨부해주세요.');
                }
                await uploadRawSingleFile(fileRawCopy);
            }

            alert('자료가 성공적으로 등록되었습니다!');
            onClose();
            router.refresh();
            window.location.reload();

        } catch (error: any) {
            console.error('Upload failed:', error);
            let msg = error.message || '업로드 중 오류가 발생했습니다.';
            if (msg.includes("Unexpected token '<'") || msg.includes('is not valid JSON')) {
                msg = '서버 응답 오류 (현재 AI 데이터 자동생성 등 백그라운드 DB 작업 중이거나, 파일 용량 제한 초과로 인해 서버가 연결을 거부했습니다). 잠시 후 다시 시도해주세요.';
            }
            setErrorMsg(msg);
        } finally {
            setIsUploading(false);
        }
    };

    // Remove inner FileUploadSlot definition


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
                    
                    {/* Toggle Upload Type */}
                    <div className="flex bg-slate-100 rounded-lg p-1 w-full max-w-sm mx-auto shadow-inner">
                        <button
                            type="button"
                            onClick={() => setUploadType('MARKET')}
                            className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${uploadType === 'MARKET' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            기출문제 일반 등록
                        </button>
                        <button
                            type="button"
                            onClick={() => setUploadType('SHADOW')}
                            className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${uploadType === 'SHADOW' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            원본 시험지 제보
                        </button>
                    </div>

                    {uploadType === 'SHADOW' && (
                        <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
                            <h3 className="font-bold text-purple-900 flex items-center gap-2 mb-1">
                                <AlertCircle size={18} /> 시험지 원본 제보하기 (비공개)
                            </h3>
                            <p className="text-xs text-purple-700 font-medium">
                                폰으로 촬영한 학교 시험지 사진이나 스캔본을 제보해주세요.<br/>
                                제보된 자료는 관리자에게만 노출되며, 이 자료를 바탕으로 개인DB가 판매될 경우 <span className="text-rose-600 font-bold bg-white px-1">판매 수익의 70%가 포인트로 자동 적립</span>됩니다.
                            </p>
                        </div>
                    )}

                    {/* Template Download Section */}
                    {uploadType === 'MARKET' && (
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
                    )}

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
                            {uploadType === 'MARKET' ? '파일 및 DB 등록' : '원천 스캔/사진 파일 등록'}
                            {uploadType === 'MARKET' ? (
                                <span className="text-[10px] font-bold text-rose-500 ml-2">* PDF와 HWP/HML 파일을 모두 등록해야 합니다.</span>
                            ) : (
                                <span className="text-[10px] font-bold text-rose-500 ml-2">* PDF 또는 이미지(JPG, PNG) 파일을 등록해주세요.</span>
                            )}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {uploadType === 'MARKET' ? (
                                <>
                                    <FileUploadSlot
                                        id="upload_pdf_sol"
                                        label="PDF 문제+해설"
                                        subLabel="문제와 해설이 포함된 파일"
                                        file={filePdfSol}
                                        setFile={setFilePdfSol}
                                        accept=".pdf"
                                        price={PRICE_PDF_SOL}
                                        Icon={PdfFileIcon}
                                        onFileChange={handleFileChange}
                                    />
                                    <FileUploadSlot
                                        id="upload_hwp_sol"
                                        label="HWP/HML 문제+해설"
                                        subLabel="문제와 해설이 포함된 파일"
                                        file={fileHwpSol}
                                        setFile={setFileHwpSol}
                                        accept=".hwp,.hwpx,.hml"
                                        price={PRICE_HWP_SOL}
                                        Icon={HwpFileIcon}
                                        onFileChange={handleFileChange}
                                    />
                                </>
                            ) : (
                                <FileUploadSlot
                                    id="upload_raw_scan"
                                    label="진짜 원본 스캔본 (사진/PDF)"
                                    subLabel="판매 수익 70% 포인트 적립"
                                    file={fileRawCopy}
                                    setFile={setFileRawCopy}
                                    accept=".pdf,.jpg,.jpeg,.png,.zip"
                                    price={0}
                                    Icon={Upload}
                                    onFileChange={handleFileChange}
                                />
                            )}

                        </div>
                    </div>

                    {errorMsg && (
                        <div className="bg-red-50 text-red-600 text-sm p-3 rounded flex items-center gap-2 animate-pulse">
                            <AlertCircle size={16} />
                            {errorMsg}
                        </div>
                    )}

                    {/* Template Compliance Checkbox */}
                    {uploadType === 'MARKET' && (
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
                    )}

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
                            disabled={isUploading || (uploadType === 'MARKET' && !isTemplateCompliant)}
                            className={`px-8 py-2.5 text-sm font-bold text-white rounded shadow-md transition-all flex items-center gap-2 ${uploadType === 'SHADOW' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-brand-600 hover:bg-brand-700'} ${isUploading || (uploadType === 'MARKET' && !isTemplateCompliant) ? 'opacity-70 cursor-not-allowed' : ''}`}
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

