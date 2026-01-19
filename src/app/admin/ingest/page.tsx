'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import SchoolAutocomplete from '@/components/SchoolAutocomplete';
import { KOREA_REGIONS } from '@/data/korean-admin-divisions';

export default function AdminIngestPage() {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [log, setLog] = useState<string[]>([]);

    // Metadata state
    const [school, setSchool] = useState('');
    const [region, setRegion] = useState('');
    const [district, setDistrict] = useState('');
    const [year, setYear] = useState('2025');
    const [semester, setSemester] = useState('1학기중간');
    const [subject, setSubject] = useState('공통수학1');
    const [grade, setGrade] = useState('고1');

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
            formData.append('school', school);
            formData.append('region', region);
            formData.append('district', district);
            formData.append('year', year);
            formData.append('semester', semester);
            formData.append('subject', subject);
            formData.append('grade', grade);

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

            <div className="space-y-4 border p-6 rounded bg-gray-50">
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
                    {/* Difficulty input removed (Managed Post-Parsing) */}
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
                    {/* Unit input removed (Managed Post-Parsing) */}
                </div>

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
