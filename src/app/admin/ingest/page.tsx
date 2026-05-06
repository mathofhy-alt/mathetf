'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import SchoolAutocomplete from '@/components/SchoolAutocomplete';
import { KOREA_REGIONS } from '@/data/korean-admin-divisions';

export default function AdminIngestPage() {
    const [activeTab, setActiveTab] = useState<'regular' | 'mock' | 'police' | 'military'>('regular');

    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [log, setLog] = useState<string[]>([]);
    const [startNumber, setStartNumber] = useState('');

    // Metadata state for Regular Exams
    const [school, setSchool] = useState('');
    const [region, setRegion] = useState('');
    const [district, setDistrict] = useState('');
    const [year, setYear] = useState('2025');
    const [semester, setSemester] = useState('1학기중간');
    const [subject, setSubject] = useState('공통수학1');
    const [grade, setGrade] = useState('고1');

    // Metadata state for Mock Exams
    const [mockYear, setMockYear] = useState('2025');
    const [mockMonth, setMockMonth] = useState('3월');
    const [mockGrade, setMockGrade] = useState('고1');
    const [mockSubject, setMockSubject] = useState('공통(수1,수2)');

    // Metadata state for Police Academy Exams
    const [policeYear, setPoliceYear] = useState('2025');
    const [policeSubject, setPoliceSubject] = useState('수학');

    // Metadata state for Military Academy Exams
    const [militaryYear, setMilitaryYear] = useState('2025');
    const [militarySubject, setMilitarySubject] = useState('수학');
    const [militaryType, setMilitaryType] = useState('육군사관학교');

    const supabase = createClient();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setFile(e.target.files[0]);
    };

    const handleUpload = async () => {
        if (!file) return;
        setLoading(true);
        setLog([]);

        try {
            const formData = new FormData();
            formData.append('file', file);
            
            if (activeTab === 'mock') {
                formData.append('school', '전국연합');
                formData.append('region', '전국');
                formData.append('district', '전국');
                formData.append('year', mockYear);
                formData.append('semester', `${mockMonth} 모의고사`);
                formData.append('subject', mockSubject);
                formData.append('grade', mockGrade);
            } else if (activeTab === 'police') {
                formData.append('school', '경찰대학교');
                formData.append('region', '경기');
                formData.append('district', '용인시');
                formData.append('year', policeYear);
                formData.append('semester', '입학시험');
                formData.append('subject', policeSubject);
                formData.append('grade', '고3');
            } else if (activeTab === 'military') {
                formData.append('school', militaryType);
                formData.append('region', '전국');
                formData.append('district', '전국');
                formData.append('year', militaryYear);
                formData.append('semester', '입학시험');
                formData.append('subject', militarySubject);
                formData.append('grade', '고3');
            } else {
                formData.append('school', school);
                formData.append('region', region);
                formData.append('district', district);
                formData.append('year', year);
                formData.append('semester', semester);
                formData.append('subject', subject);
                formData.append('grade', grade);
            }

            if (startNumber.trim()) {
                formData.append('startNumber', startNumber);
            }

            // Determine API endpoint based on file extension
            const isHml = file.name.toLowerCase().endsWith('.hml');
            const apiEndpoint = isHml ? '/api/admin/ingest-hml' : '/api/admin/ingest-hwpx';

            // Call the appropriate API route
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                setLog(prev => [...prev, `Success! Processed ${result.questionCount} questions.`]);
            } else {
                setLog(prev => [...prev, `Error: ${result.error}`]);
                if (result.debug) {
                    setLog(prev => [...prev, `DEBUG INFO: ${JSON.stringify(result.debug, null, 2)}`]);
                }
            }

        } catch (error) {
            console.error(error);
            setLog(prev => [...prev, 'Upload failed.']);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">관리자: HWPX/HML 문제 DB 업로드</h1>

            {/* Tabs */}
            <div className="flex mb-6 border-b">
                <button
                    className={`flex-1 py-3 text-center font-bold text-sm transition-colors ${activeTab === 'regular' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    onClick={() => setActiveTab('regular')}
                >
                    내신 (학교) 기출
                </button>
                <button
                    className={`flex-1 py-3 text-center font-bold text-sm transition-colors ${activeTab === 'mock' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    onClick={() => setActiveTab('mock')}
                >
                    전국연합 모의고사
                </button>
                <button
                    className={`flex-1 py-3 text-center font-bold text-sm transition-colors ${activeTab === 'police' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    onClick={() => setActiveTab('police')}
                >
                    경찰대
                </button>
                <button
                    className={`flex-1 py-3 text-center font-bold text-sm transition-colors ${activeTab === 'military' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    onClick={() => setActiveTab('military')}
                >
                    사관학교
                </button>
            </div>

            <div className="space-y-4 border p-6 rounded bg-gray-50">
                {activeTab === 'regular' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium mb-1">학교명</label>
                            <SchoolAutocomplete
                                value={school}
                                onChange={setSchool}
                                onSchoolSelect={(s) => {
                                    if (s.region) setRegion(s.region);
                                    if (s.district) setDistrict(s.district);
                                }}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">시/도</label>
                                <select
                                    className="w-full border p-2 rounded"
                                    value={region}
                                    onChange={e => {
                                        setRegion(e.target.value);
                                        setDistrict(''); // Reset district on region change
                                    }}
                                >
                                    <option value="">선택하세요</option>
                                    {Object.keys(KOREA_REGIONS).map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">구/군</label>
                                <select
                                    className="w-full border p-2 rounded"
                                    value={district}
                                    onChange={e => setDistrict(e.target.value)}
                                    disabled={!region}
                                >
                                    <option value="">{region ? '선택하세요' : '시/도를 먼저 선택하세요'}</option>
                                    {region && KOREA_REGIONS[region]?.map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">연도</label>
                                <select className="w-full border p-2 rounded" value={year} onChange={e => setYear(e.target.value)}>
                                    {['2026', '2025', '2024', '2023', '2022', '2021', '2020'].map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">학기</label>
                                <select className="w-full border p-2 rounded" value={semester} onChange={e => setSemester(e.target.value)}>
                                    <option value="1학기중간">1학기중간</option>
                                    <option value="1학기기말">1학기기말</option>
                                    <option value="2학기중간">2학기중간</option>
                                    <option value="2학기기말">2학기기말</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">학년</label>
                                <select className="w-full border p-2 rounded" value={grade} onChange={e => setGrade(e.target.value)}>
                                    <option value="고1">고1</option>
                                    <option value="고2">고2</option>
                                    <option value="고3">고3</option>
                                    <option value="중1">중1</option>
                                    <option value="중2">중2</option>
                                    <option value="중3">중3</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">과목</label>
                                <select className="w-full border p-2 rounded" value={subject} onChange={e => setSubject(e.target.value)}>
                                    <option value="공통수학1">공통수학1</option>
                                    <option value="공통수학2">공통수학2</option>
                                    <option value="대수">대수</option>
                                    <option value="미적분1">미적분1</option>
                                    <option value="미적분2">미적분2</option>
                                    <option value="기하">기하</option>
                                    <option value="확통">확통</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">문항 시작 번호 (선택)</label>
                                <input 
                                    type="number" 
                                    className="w-full border p-2 rounded" 
                                    placeholder="예: 23 (미입력시 자동)" 
                                    value={startNumber} 
                                    onChange={e => setStartNumber(e.target.value)} 
                                />
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'mock' && (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">실시 연도</label>
                                <select className="w-full border p-2 rounded" value={mockYear} onChange={e => setMockYear(e.target.value)}>
                                    {['2026', '2025', '2024', '2023', '2022', '2021', '2020'].map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">실시 월</label>
                                <select className="w-full border p-2 rounded" value={mockMonth} onChange={e => setMockMonth(e.target.value)}>
                                    {['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'].map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">대상 학년</label>
                                <select className="w-full border p-2 rounded" value={mockGrade} onChange={e => setMockGrade(e.target.value)}>
                                    <option value="고1">고1</option>
                                    <option value="고2">고2</option>
                                    <option value="고3">고3</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">시험 유형 (과목)</label>
                                <select className="w-full border p-2 rounded" value={mockSubject} onChange={e => setMockSubject(e.target.value)}>
                                    <optgroup label="현행 (2022학년도~)">
                                        <option value="공통(수1,수2)">공통(수1,수2)</option>
                                        <option value="미적분II">미적분II</option>
                                        <option value="기하">기하</option>
                                        <option value="확률과 통계">확률과 통계</option>
                                        <option value="전과목">전과목 (고1, 고2 등)</option>
                                    </optgroup>
                                    <optgroup label="구교과과정 (-2021학년도)">
                                        <option value="가형">가형</option>
                                        <option value="나형">나형</option>
                                    </optgroup>
                                </select>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">문항 시작 번호 (선택)</label>
                                <input 
                                    type="number" 
                                    className="w-full border p-2 rounded" 
                                    placeholder="예: 23 (선택과목용)" 
                                    value={startNumber} 
                                    onChange={e => setStartNumber(e.target.value)} 
                                />
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'police' && (
                    <>
                        <div className="text-sm text-gray-500 bg-blue-50 border border-blue-200 rounded p-3 mb-2">
                            🏫 학교: <strong>경찰대학교</strong> | 지역: <strong>경기 / 용인시</strong> | 시험: <strong>입학시험</strong> | 학년: <strong>고3</strong>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">실시 연도</label>
                                <select className="w-full border p-2 rounded" value={policeYear} onChange={e => setPoliceYear(e.target.value)}>
                                    {['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017'].map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">시험 유형 (과목)</label>
                                <select className="w-full border p-2 rounded" value={policeSubject} onChange={e => setPoliceSubject(e.target.value)}>
                                    <optgroup label="현행 (2022학년도~)">
                                        <option value="수학">수학 (공통+선택)</option>
                                        <option value="미적분II">미적분II</option>
                                        <option value="기하">기하</option>
                                        <option value="확률과 통계">확률과 통계</option>
                                    </optgroup>
                                    <optgroup label="구교과과정 (-2021학년도)">
                                        <option value="가형">가형</option>
                                        <option value="나형">나형</option>
                                    </optgroup>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">문항 시작 번호 (선택)</label>
                                <input
                                    type="number"
                                    className="w-full border p-2 rounded"
                                    placeholder="예: 1 (미입력시 자동)"
                                    value={startNumber}
                                    onChange={e => setStartNumber(e.target.value)}
                                />
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'military' && (
                    <>
                        <div className="text-sm text-gray-500 bg-green-50 border border-green-200 rounded p-3 mb-2">
                            🏫 시험: <strong>입학시험</strong> | 학년: <strong>고3</strong>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">사관학교 구분</label>
                                <select className="w-full border p-2 rounded" value={militaryType} onChange={e => setMilitaryType(e.target.value)}>
                                    <option value="육군사관학교">육군사관학교</option>
                                    <option value="해군사관학교">해군사관학교</option>
                                    <option value="공군사관학교">공군사관학교</option>
                                    <option value="국군간호사관학교">국군간호사관학교</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">실시 연도</label>
                                <select className="w-full border p-2 rounded" value={militaryYear} onChange={e => setMilitaryYear(e.target.value)}>
                                    {['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017'].map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">시험 유형 (과목)</label>
                                <select className="w-full border p-2 rounded" value={militarySubject} onChange={e => setMilitarySubject(e.target.value)}>
                                    <optgroup label="현행 (2022학년도~)">
                                        <option value="수학">수학 (공통+선택)</option>
                                        <option value="미적분II">미적분II</option>
                                        <option value="기하">기하</option>
                                        <option value="확률과 통계">확률과 통계</option>
                                    </optgroup>
                                    <optgroup label="구교과과정 (-2021학년도)">
                                        <option value="가형">가형</option>
                                        <option value="나형">나형</option>
                                    </optgroup>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">문항 시작 번호 (선택)</label>
                                <input
                                    type="number"
                                    className="w-full border p-2 rounded"
                                    placeholder="예: 1 (미입력시 자동)"
                                    value={startNumber}
                                    onChange={e => setStartNumber(e.target.value)}
                                />
                            </div>
                        </div>
                    </>
                )}

                <div className="pt-4 border-t">
                    <label className="block text-sm font-medium mb-1">HWPX 또는 HML 파일 선택</label>
                    <input
                        type="file"
                        accept=".hwpx,.hml"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-slate-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-violet-50 file:text-violet-700
              hover:file:bg-violet-100"
                    />
                </div>

                <button
                    onClick={handleUpload}
                    disabled={!file || loading}
                    className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? '처리 중...' : '업로드 및 분석 시작'}
                </button>
            </div>

            <div className="mt-8">
                <h3 className="font-semibold mb-2">처리 로그:</h3>
                <div className="bg-black text-green-400 p-4 rounded h-40 overflow-auto text-sm font-mono">
                    {log.map((l, i) => <div key={i}>{l}</div>)}
                </div>
            </div>
        </div>
    );
}
