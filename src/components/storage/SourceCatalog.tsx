"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import FileGrid from './FileGrid';
import type { UserItem } from '@/types/storage';
import { sourceCategory, sourceCategories, type SourceCategory } from '@/lib/questions/source-category';

export default function SourceCatalog({items, selectedIds, onItemSelect, onGroupSelect, onGetViewItems}: {
    items: UserItem[]; selectedIds: string[];
    onItemSelect: (item: UserItem) => void;
    onGroupSelect: (items: UserItem[], select: boolean) => void;
    onGetViewItems: (items: UserItem[]) => void;
}) {
    const [category, setCategory] = useState<SourceCategory>('school');
    const [search, setSearch] = useState('');
    const groups = useMemo(() => Object.fromEntries(sourceCategories.map(c =>
        [c.id, items.filter(item => sourceCategory(item.details || {}) === c.id)])) as Record<SourceCategory, UserItem[]>, [items]);
    // '내 개인DB' 칸은 전용 DB 가 있는 회원에게만 보이고, 있으면 처음에 그 칸을 연다 (10/6)
    const tabs = sourceCategories.filter(c => c.id !== 'mine' || groups.mine.length > 0);
    const openedMine = useRef(false);
    useEffect(() => {
        if (!openedMine.current && groups.mine.length > 0) { openedMine.current = true; setCategory('mine'); }
    }, [groups.mine.length]);
    const visible = useMemo(() => {
        const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        return groups[category].filter(item => words.every(word => (item.name || '').toLocaleLowerCase().includes(word)));
    }, [groups, category, search]);
    const report = useRef(onGetViewItems);
    report.current = onGetViewItems;
    useEffect(() => { report.current(visible); }, [visible]);
    return <section className="flex h-full min-h-0 flex-col overflow-hidden" aria-label="출제 자료 분류">
        <div className="rd-seg" role="group" aria-label="자료 종류">
            {tabs.map(c => <button key={c.id} type="button" aria-pressed={category === c.id}
                onClick={() => { setCategory(c.id); setSearch(''); onGetViewItems(groups[c.id]); }}
                style={{ minHeight: 52, padding: '6px 8px', lineHeight: 1.3 }}>
                {c.label}<span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--rd-sub)' }}>{groups[c.id].length}개</span>
            </button>)}
        </div>
        <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="rd-help" style={{ margin: 0 }}>{category === 'mine' ? '회원님만 쓰는 전용 개인DB입니다.' : category === 'national' ? '전국연합·평가원·수능 자료입니다.' : category === 'special' ? '사관학교·경찰대 입학시험 자료입니다.' : '학교별 내신 기출 자료입니다.'} 분류를 바꿔도 선택한 자료는 유지됩니다.</p>
            <input aria-label="선택한 분류에서 자료 검색" placeholder="학교명, 연도 등으로 검색..." value={search} onChange={e => setSearch(e.target.value)} className="rd-input" style={{ minHeight: 46, fontSize: 15 }} />
            <p role="status" className="rd-help" style={{ margin: 0, fontWeight: 700 }}>{sourceCategories.find(c => c.id === category)?.label} · {visible.length}개 자료</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rd-well" style={{ overflowX: 'hidden' }}>
            {visible.length ? <FileGrid key={`${category}:${search}`} selectionOnly folders={[]} items={visible} selectedIds={selectedIds}
                onItemClick={onItemSelect} onGroupSelect={onGroupSelect}
                onFolderClick={() => {}} onRename={() => {}} onDelete={() => {}} onMoveItem={() => {}} onContextMenu={() => {}} />
                : <p className="rd-empty" style={{ margin: 0 }}>이 분류에 조건과 일치하는 자료가 없습니다.</p>}
        </div>
    </section>;
}
