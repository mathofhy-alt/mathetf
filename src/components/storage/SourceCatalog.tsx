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
    const visible = useMemo(() => {
        const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        return groups[category].filter(item => words.every(word => (item.name || '').toLocaleLowerCase().includes(word)));
    }, [groups, category, search]);
    const report = useRef(onGetViewItems);
    report.current = onGetViewItems;
    useEffect(() => { report.current(visible); }, [visible]);
    return <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="출제 자료 분류">
        <div className="grid grid-cols-3 gap-2 border-b border-slate-200 p-3" role="group" aria-label="자료 종류">
            {sourceCategories.map(c => <button key={c.id} type="button" aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
                className={`min-w-0 rounded-xl border px-2 py-3 text-sm font-bold transition ${category === c.id ? 'border-[#426D36] bg-[#426D36] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                {c.label}<span className="mt-1 block text-xs font-normal opacity-80">{groups[c.id].length}개</span>
            </button>)}
        </div>
        <div className="space-y-2 border-b border-slate-200 p-3">
            <p className="text-xs text-slate-500">{category === 'national' ? '전국연합·평가원·수능 자료입니다.' : category === 'special' ? '사관학교·경찰대 입학시험 자료입니다.' : '학교별 내신 기출 자료입니다.'} 분류를 바꿔도 선택한 자료는 유지됩니다.</p>
            <input aria-label="선택한 분류에서 자료 검색" placeholder="학교명, 연도 등으로 검색..." value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            <p role="status" className="text-xs text-slate-500">{sourceCategories.find(c => c.id === category)?.label} · {visible.length}개 자료</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
            {visible.length ? <FileGrid key={`${category}:${search}`} selectionOnly folders={[]} items={visible} selectedIds={selectedIds}
                onItemClick={onItemSelect} onGroupSelect={onGroupSelect}
                onFolderClick={() => {}} onRename={() => {}} onDelete={() => {}} onMoveItem={() => {}} onContextMenu={() => {}} />
                : <p className="p-8 text-center text-sm text-slate-500">이 분류에 조건과 일치하는 자료가 없습니다.</p>}
        </div>
    </section>;
}
