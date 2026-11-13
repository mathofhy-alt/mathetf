
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Loader2, AlertTriangle, X } from 'lucide-react';
import FolderExplorer from './FolderExplorer';
import type { UserItem } from '@/types/storage';

// [11/14 대표] 「만든 시험지」 창과 같은 폴더 창으로 고른다 — 예전엔 저장한 시험지를 날짜순으로만 늘어놓아
//   폴더로 정리해 둔 회원(반·학생별 회차)이 찾기 어려웠다. 「비슷한 문제로 새 시험지」도 이 창에서 뺄 시험지를 고른다.
interface DuplicateCheckModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** 고른 시험지들에 쓰인 문항 id(중복 제거)·이름 */
    onCheck: (questionIds: string[], examName: string) => void;
    title?: string;
    sub?: string;
    note?: string;
    confirmLabel?: string;
    skipLabel?: string;
    /** 처음부터 골라 둘 시험지(user_items.id) */
    preselected?: string[];
    /** 아무것도 안 골라도 확인을 누를 수 있다 */
    allowEmpty?: boolean;
}

export default function DuplicateCheckModal({
    isOpen, onClose, onCheck,
    title = '중복 소스 체크',
    sub = '이전에 만든 시험지를 고르면 그 시험지에 쓴 문제는 검색에서 빠집니다. 여러 개 고를 수 있습니다.',
    note = '선택한 시험지들에 사용된 문제는 검색 결과에서 자동으로 제외됩니다.',
    confirmLabel = '확인 및 제외', skipLabel = '건너뛰기', preselected, allowEmpty = false,
}: DuplicateCheckModalProps) {
    const [selected, setSelected] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => { if (isOpen) setSelected(preselected || []); }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggle = (item: UserItem) => {
        if (item.type !== 'saved_exam') return;
        setSelected(p => p.includes(item.id) ? p.filter(x => x !== item.id) : [...p, item.id]);
    };

    const handleConfirm = async () => {
        if (!selected.length) { if (allowEmpty) onCheck([], ''); return; }
        setBusy(true);
        try {
            // 열어 본 폴더만 목록을 갖고 있으니, 고른 시험지의 문항 목록은 한 번에 다시 읽는다(본인 것만 보임)
            const { data, error } = await createClient().from('user_items').select('id, name, details').in('id', selected);
            if (error) throw error;
            const ids = new Set<string>();
            (data || []).forEach((e: any) => (e.details?.question_ids || []).forEach((q: any) => {
                const id = typeof q === 'string' ? q : q?.id;
                if (id) ids.add(id);
            }));
            onCheck(Array.from(ids), (data || []).map((e: any) => e.name).join(', '));
        } catch {
            alert('선택한 시험지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        } finally { setBusy(false); }
    };

    if (!isOpen) return null;

    return (
        <div className="rd rd-overlay">
            <div className="rd-modal rd-modal-flush rd-modal-catalog">
                <div className="rd-sheet-handle" />
                <div className="rd-modal-band rd-modal-head">
                    <div style={{ minWidth: 0 }}>
                        <h3 className="rd-modal-title">{title}</h3>
                        <p className="rd-modal-sub">{sub}</p>
                    </div>
                    <button onClick={onClose} aria-label="닫기" className="rd-modal-x"><X size={20} /></button>
                </div>

                <div className="rd-storage-body">
                    <p className="rd-modal-note" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <AlertTriangle size={18} style={{ flex: 'none', marginTop: 3 }} />
                        <span>{note}</span>
                    </p>
                    <div className="flex-1 min-h-0">
                        <FolderExplorer
                            filterType="exam"
                            picker
                            onItemSelect={toggle}
                            onGroupSelect={(items, select) => {
                                const ids = items.filter(i => i.type === 'saved_exam').map(i => i.id);
                                setSelected(p => select ? Array.from(new Set([...p, ...ids])) : p.filter(id => !ids.includes(id)));
                            }}
                            selectedIds={selected}
                        />
                    </div>
                </div>

                <div className="rd-modal-foot" style={{ alignItems: 'center', padding: '12px 28px 20px' }}>
                    <span style={{ marginRight: 'auto', fontSize: 15, fontWeight: 600, color: 'var(--rd-sub)' }}>
                        {selected.length}개 선택됨
                    </span>
                    {selected.length > 0 && <button onClick={() => setSelected([])} className="rd-btn rd-btn-gray">선택 해제</button>}
                    <button onClick={onClose} className="rd-btn rd-btn-gray">{skipLabel}</button>
                    <button onClick={() => void handleConfirm()} disabled={busy || (!allowEmpty && selected.length === 0)} className="rd-btn rd-btn-primary">
                        {busy ? <Loader2 size={16} className="animate-spin" /> : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
