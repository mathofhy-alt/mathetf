
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Loader2, AlertTriangle, Check, X } from 'lucide-react';

interface DuplicateCheckModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCheck: (questionIds: string[], examName: string) => void;
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

    const handleConfirm = () => {
        if (selectedExamIds.size === 0) return;

        const selectedExams = exams.filter(e => selectedExamIds.has(e.id));
        const allUsedQuestionIds = new Set<string>();

        // user_items.details에 question_ids가 저장되어 있으므로 바로 사용
        selectedExams.forEach((exam) => {
            const ids: string[] = exam.details?.question_ids || [];
            ids.forEach((id: string) => allUsedQuestionIds.add(id));
        });

        const examNames = selectedExams.map(e => e.name).join(', ');
        onCheck(Array.from(allUsedQuestionIds), examNames);
    };

    if (!isOpen) return null;

    return (
        <div className="rd rd-overlay">
            <div className="rd-modal rd-modal-dup">
                <div className="rd-sheet-handle" />
                <div className="rd-modal-head">
                    <div style={{ minWidth: 0 }}>
                        <h3 className="rd-modal-title">중복 소스 체크</h3>
                        <p className="rd-modal-sub">비교할 이전 시험지를 선택하세요. 여러 개 고를 수 있습니다.</p>
                    </div>
                    <button onClick={onClose} aria-label="닫기" className="rd-modal-x"><X size={20} /></button>
                </div>

                <p className="rd-modal-note" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <AlertTriangle size={18} style={{ flex: 'none', marginTop: 3 }} />
                    <span>선택한 시험지들에 사용된 문제는 검색 결과에서 자동으로 제외됩니다.</span>
                </p>

                <div className="rd-modal-body rd-well" style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0', color: 'var(--rd-icon)' }}><Loader2 className="animate-spin" /></div>
                    ) : exams.length === 0 ? (
                        <div className="rd-empty">저장된 시험지가 없습니다.</div>
                    ) : (
                        exams.map(exam => {
                            const isSelected = selectedExamIds.has(exam.id);
                            return (
                                <button
                                    key={exam.id}
                                    onClick={() => toggleSelection(exam.id)}
                                    className={`rd-pick${isSelected ? ' is-on' : ''}`}
                                >
                                    <span className="rd-pick-box">{isSelected && <Check size={14} strokeWidth={3} />}</span>
                                    <span style={{ minWidth: 0, flex: 1 }}>
                                        <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exam.name}</span>
                                        <span style={{ display: 'block', marginTop: 2, fontSize: 13, color: 'var(--rd-sub)' }}>
                                            {new Date(exam.created_at).toLocaleDateString()}
                                        </span>
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>

                <div className="rd-modal-foot" style={{ alignItems: 'center' }}>
                    <span style={{ marginRight: 'auto', fontSize: 15, fontWeight: 600, color: 'var(--rd-sub)' }}>
                        {selectedExamIds.size}개 선택됨
                    </span>
                    <button
                        onClick={onClose}
                        className="rd-btn rd-btn-gray"
                    >
                        건너뛰기
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selectedExamIds.size === 0}
                        className="rd-btn rd-btn-primary"
                    >
                        확인 및 제외
                    </button>
                </div>
            </div>
        </div>
    );
}

