'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { Info } from 'lucide-react';

export default function AdminInventory() {
    const supabase = createClient();
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);

    // Filters
    const [regions, setRegions] = useState<string[]>([]);
    const [districtsMap, setDistrictsMap] = useState<Record<string, string[]>>({});
    const [schoolsMap, setSchoolsMap] = useState<Record<string, Record<string, string[]>>>({});
    
    const [selectedRegion, setSelectedRegion] = useState('서울');
    const [selectedDistrict, setSelectedDistrict] = useState('강남구');
    const [selectedYear, setSelectedYear] = useState('2024');
    const [selectedGrade, setSelectedGrade] = useState('1');
    const [selectedExamType, setSelectedExamType] = useState('1학기 중간고사');

    const [matrixData, setMatrixData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || user.email !== 'mathofhy@naver.com') {
                router.push('/');
                return;
            }
            setUser(user);

            // Fetch schools
            let allSchoolData: any[] = [];
            let from = 0;
            const step = 1000;
            while (true) {
                const { data, error } = await supabase.from('schools').select('region, district, name').range(from, from + step - 1);
                if (!data || data.length === 0) break;
                allSchoolData = [...allSchoolData, ...data];
                if (data.length < step) break;
                from += step;
            }

            const newRegions = new Set<string>();
            const newDistricts: Record<string, Set<string>> = {};
            const newSchools: Record<string, Record<string, string[]>> = {};

            allSchoolData.forEach(item => {
                newRegions.add(item.region);
                if (!newDistricts[item.region]) newDistricts[item.region] = new Set();
                newDistricts[item.region].add(item.district);
                if (!newSchools[item.region]) newSchools[item.region] = {};
                if (!newSchools[item.region][item.district]) newSchools[item.region][item.district] = [];
                newSchools[item.region][item.district].push(item.name);
            });

            setRegions(Array.from(newRegions).sort());
            const finalDistricts: Record<string, string[]> = {};
            Object.keys(newDistricts).forEach(r => finalDistricts[r] = Array.from(newDistricts[r]).sort());
            setDistrictsMap(finalDistricts);

            Object.keys(newSchools).forEach(r => {
                Object.keys(newSchools[r]).forEach(d => {
                    newSchools[r][d].sort();
                });
            });
            setSchoolsMap(newSchools);
        };
        init();
    }, [router, supabase]);

    useEffect(() => {
        if (!selectedRegion || !selectedDistrict || !selectedYear || !selectedGrade) return;

        const fetchData = async () => {
            setIsLoading(true);
            const targetSchools = schoolsMap[selectedRegion]?.[selectedDistrict] || [];
            
            if (targetSchools.length === 0) {
                setMatrixData([]);
                setIsLoading(false);
                return;
            }

            const { data } = await supabase
                .from('exam_materials')
                .select('school, title, semester, exam_type, exam_year, file_type, content_type')
                .in('school', targetSchools)
                .eq('grade', parseInt(selectedGrade))
                .not('school', 'eq', 'DELETED');

            const result = targetSchools.map(school => {
                const row: any = { school, exams: {} };
                const schoolExams = (data || []).filter(d => d.school === school);
                
                ['1학기 중간고사', '1학기 기말고사', '2학기 중간고사', '2학기 기말고사'].forEach(extype => {
                    const sem = extype.startsWith('1') ? 1 : 2;
                    const type = extype.includes('중간고사') ? '중간고사' : '기말고사';
                    
                    const materials = schoolExams.filter(e => {
                        const yearDerived = e.title?.match(/20\d{2}/)?.[0] ? parseInt(e.title.match(/20\d{2}/)[0]) : (e.exam_year || 2024);
                        if (String(yearDerived) !== selectedYear) return false;
                        return e.semester === sem && e.exam_type === type;
                    });

                    let hasPdfProb = false;
                    let hasHwpSol = false;
                    let hasDb = false;

                    materials.forEach(m => {
                        if (m.content_type === '원본제보' || m.file_type?.toUpperCase() === 'PDF') hasPdfProb = true;
                        if (m.file_type?.toUpperCase() === 'HWP') hasHwpSol = true;
                        if (m.file_type?.toUpperCase() === 'DB') hasDb = true;
                    });

                    const missing = [];
                    if (!hasPdfProb) missing.push('PDF');
                    if (!hasHwpSol) missing.push('HWP');
                    if (!hasDb) missing.push('DB');

                    let status = 'empty';
                    if (materials.length > 0) {
                        if (missing.length === 0) status = 'complete';
                        else status = 'partial';
                    }

                    row.exams[extype] = { status, missing, hasPdfProb, hasHwpSol, hasDb };
                });
                return row;
            });

            setMatrixData(result);
            setIsLoading(false);
        };

        fetchData();
    }, [selectedRegion, selectedDistrict, selectedYear, selectedGrade, schoolsMap, supabase]);

    if (!user) return null;

    const getStatusColor = (status: string) => {
        if (status === 'complete') return 'bg-green-500 border-green-600';
        if (status === 'partial') return 'bg-yellow-400 border-yellow-500 cursor-help';
        return 'bg-slate-100 border-slate-200';
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
            <Header user={user} />
            <main className="max-w-[1200px] mx-auto px-4 py-8">
                <div className="mb-6">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                        🎯 기출 보유 현황판 (Admin)
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">학교별 지필고사 데이터베이스 보유/결측 현황 (초록: 완료, 노랑: 미완, 회색: 없음)</p>
                </div>

                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-row flex-wrap items-center gap-4 mb-6">
                    <select className="form-select text-sm h-10 border-slate-300 rounded w-32" value={selectedRegion} onChange={e => { setSelectedRegion(e.target.value); setSelectedDistrict(''); }}>
                        <option value="">시/도</option>
                        {regions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select className="form-select text-sm h-10 border-slate-300 rounded w-32" value={selectedDistrict} onChange={e => setSelectedDistrict(e.target.value)} disabled={!selectedRegion}>
                        <option value="">구/군</option>
                        {(districtsMap[selectedRegion] || []).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select className="form-select text-sm h-10 border-slate-300 rounded w-32" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                        <option value="2025">2025년</option>
                        <option value="2024">2024년</option>
                        <option value="2023">2023년</option>
                    </select>
                    <select className="form-select text-sm h-10 border-slate-300 rounded w-32" value={selectedGrade} onChange={e => setSelectedGrade(e.target.value)}>
                        <option value="1">1학년</option>
                        <option value="2">2학년</option>
                        <option value="3">3학년</option>
                    </select>
                    <select className="form-select text-sm h-10 border-slate-300 rounded w-40" value={selectedExamType} onChange={e => setSelectedExamType(e.target.value)}>
                        <option value="1학기 중간고사">1학기 중간고사</option>
                        <option value="1학기 기말고사">1학기 기말고사</option>
                        <option value="2학기 중간고사">2학기 중간고사</option>
                        <option value="2학기 기말고사">2학기 기말고사</option>
                    </select>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
                    {isLoading ? (
                        <div className="p-20 text-center text-slate-400 font-bold animate-pulse text-lg">데이터를 스캔하는 중입니다...</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100 border-b border-slate-200">
                                <tr>
                                    <th className="py-3 px-4 text-left font-extrabold text-slate-700 w-1/3 border-r border-slate-200">학교명</th>
                                    <th className="py-3 px-4 text-center font-bold text-slate-600">[{selectedExamType}] 상세 현황</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {matrixData.map(row => {
                                    const cell = row.exams[selectedExamType];
                                    return (
                                        <tr key={row.school} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-3 px-4 font-bold text-slate-800 border-r border-slate-100">{row.school}</td>
                                            <td className="py-2 px-4 text-center bg-white border-l border-slate-50">
                                                <div className="flex justify-center group relative">
                                                    <div className={`w-32 h-8 rounded border ${getStatusColor(cell.status)} shadow-inner flex items-center justify-center transition-all duration-200`}>
                                                        {cell.status === 'complete' && <span className="text-white font-extrabold text-xs tracking-wide">완료</span>}
                                                        {cell.status === 'partial' && <span className="text-yellow-900 font-extrabold text-[10px] tracking-wide flex items-center gap-1"><Info size={10}/>결측 발생</span>}
                                                        {cell.status === 'empty' && <span className="text-slate-300 font-bold">-</span>}
                                                    </div>
                                                    
                                                    {cell.status === 'partial' && (
                                                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 w-48 bg-slate-800 text-white text-[11px] p-3 rounded-lg shadow-2xl font-medium text-left">
                                                            <div className="mb-2 text-slate-300 font-bold border-b border-slate-600 pb-1">{row.school} {selectedExamType}</div>
                                                            <div className="text-red-400 mb-1 leading-snug">❌ 누락:<br/>{cell.missing.join(', ')}</div>
                                                            <div className="mt-1 text-green-400 leading-snug">✅ 보유:<br/>{['PDF', 'HWP', 'DB'].filter(x => !cell.missing.includes(x)).join(', ')}</div>
                                                            
                                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {matrixData.length === 0 && !isLoading && (
                                    <tr>
                                        <td colSpan={2} className="py-20 text-center text-slate-500 font-medium">해당 지역에 등록된 학교가 없습니다.</td>
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
