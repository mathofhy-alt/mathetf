
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Loader2, AlertTriangle, Check } from 'lucide-react';

interface DuplicateCheckModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCheck: (sourceDbIds: string[], examName: string) => void;
}

export default function DuplicateCheckModal({ isOpen, onClose, onCheck }: DuplicateCheckModalProps) {
    const [exams, setExams] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedExamIds, setSelectedExamIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isOpen) {
            fetchExams();
            setSelectedExamIds(new Set());
        }
    }, [isOpen]);

    const fetchExams = async () => {
        setLoading(true);
        const supabase = createClient();
        const { data, error } = await supabase
            .from('user_items')
            .select('*')
            .eq('type', 'saved_exam')
            .order('created_at', { ascending: false });

        if (error) console.error(error);
        if (data) setExams(data);
        setLoading(false);
    };

    const toggleSelection = (id: string) => {
        const next = new Set(selectedExamIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedExamIds(next);
    };

    const handleConfirm = async () => {
        if (selectedExamIds.size === 0) return;

        setLoading(true);
        const selectedExams = exams.filter(e => selectedExamIds.has(e.id));
        const allUsedSources = new Set<string>();
        const supabase = createClient();

        // New Logic: Fetch metadata sidecar JSON files from Storage
        try {
            const promises = selectedExams.map(async (exam) => {
                const fileId = exam.reference_id; // reference_id is the file UUID
                // The filename structure is user_id/fileId.hml
                // The metadata json is user_id/fileId.json
                // But wait, user_items doesn't store the user_id path explicitly unless we assume current user.
                // Yes, user can only see own items.
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return [];

                const jsonPath = `${user.id}/${fileId}.json`;

                const { data, error } = await supabase.storage
                    .from('exams')
                    .download(jsonPath);

                if (error) {
                    console.warn(`Metadata missing for ${exam.name} (${jsonPath})`, error);
                    return [];
                }

                const text = await data.text();
                const json = JSON.parse(text);
                return json.source_db_ids || [];
            });

            const results = await Promise.all(promises);
            results.flat().forEach((id: string) => allUsedSources.add(id));

            setLoading(false);
            const examNames = selectedExams.map(e => e.name).join(', ');
            onCheck(Array.from(allUsedSources), examNames);

        } catch (e) {
            console.error("Error fetching metadata", e);
            setLoading(false);
            alert("일부 시험지의 정보를 불러오는 중 오류가 발생했습니다.");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-[500px] h-[600px] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-xl flex items-center gap-2 text-slate-800">
                        <Check className="text-green-600" />
                        중복 소스 체크
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>

                <p className="text-sm text-slate-500 mb-4 bg-slate-50 p-3 rounded-lg flex gap-2 items-start">
                    <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                    <span>
                        비교할 이전 시험지를 선택하세요. (다중 선택 가능)<br />
                        선택한 시험지들에 사용된 소스(DB)는 현재 선택 목록에서 <b>자동으로 제외</b>됩니다.
                    </span>
                </p>

                <div className="flex-1 overflow-y-auto border rounded-xl bg-slate-50 p-2 space-y-2 custom-scrollbar">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div>
                    ) : exams.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 text-sm">저장된 시험지가 없습니다.</div>
                    ) : (
                        exams.map(exam => {
                            const isSelected = selectedExamIds.has(exam.id);
                            return (
                                <button
                                    key={exam.id}
                                    onClick={() => toggleSelection(exam.id)}
                                    className={`w-full text-left p-3 rounded-lg border transition-all ${isSelected
                                        ? 'bg-purple-100 border-purple-300 ring-1 ring-purple-300'
                                        : 'bg-white border-slate-200 hover:border-purple-200 hover:bg-slate-50'
                                        }`}
                                >
                                    <div className="flex justify-between items-center">
                                        <div className="font-bold text-slate-800 truncate">{exam.name}</div>
                                        {isSelected && <Check size={16} className="text-purple-600" />}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1">
                                        {new Date(exam.created_at).toLocaleDateString()}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                <div className="mt-4 flex gap-2 justify-between items-center pt-4 border-t border-slate-100">
                    <div className="text-sm text-slate-500 font-medium">
                        {selectedExamIds.size}개 선택됨
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-slate-500 hover:text-slate-800 font-bold"
                        >
                            건너뛰기
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={selectedExamIds.size === 0}
                            className="px-6 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 disabled:opacity-50 transition shadow-lg hover:shadow-purple-200"
                        >
                            확인 및 제외
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
