'use client';

import { createClient } from '@/utils/supabase/client';
import { downloadSavedExam } from '@/lib/pdfDownload';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { FolderPlus, RefreshCw, DownloadCloud, Search, X, ChevronRight, Folder as FolderIcon, FolderInput } from 'lucide-react';
import FolderTree from './FolderTree';
import FileGrid from './FileGrid';
import StorageContextMenu from './StorageContextMenu';
import MoveToFolderModal from './MoveToFolderModal';
import InputModal from '../common/InputModal';
import { isNaesinFolder, isVirtualFolder, type Folder, type UserItem } from '@/types/storage';

interface FolderExplorerProps {
    onItemSelect: (item: UserItem) => void;
    onSelectAll?: (items: UserItem[]) => void;
    onGroupSelect?: (items: UserItem[], select: boolean) => void;
    selectedIds?: string[];
    filterType?: 'all' | 'db' | 'exam';
    initialData?: any;
    refreshKey?: number;
    onGetViewItems?: (items: UserItem[]) => void;
}

// [11/12 대표] 「윈도우 탐색기처럼 가볍고 빠르게」
//   예전엔 폴더 만들기·이름 바꾸기·옮기기·삭제 때마다 보관함 전체를 다시 불러와(4초 남짓) 맨 바깥 폴더로 튕겨 나갔다.
//   이제는 화면을 먼저 바꾸고(낙관적 갱신) 서버 저장은 뒤에서 한다 — 실패하면 다시 불러와 원래대로 돌리고 알린다.
//   보던 폴더에 그대로 머문다. 휴대폰은 끌기·오른쪽 클릭이 없어서 줄마다 「⋯」 메뉴와 「이동」 창으로 옮긴다.
const ROOT = 'root';
const NONE: UserItem[] = [];   // 매번 새 [] 를 만들면 onGetViewItems 효과가 끝없이 돈다
const keyOf = (id: string | null) => id ?? ROOT;
const rank = (f: Folder) => f.id === 'mock-exam-root' ? 0 : (f.id === 'exam-school-root' || f.name === '사관학교·경찰대') ? 1 : isNaesinFolder(f.name) ? 2 : 3;
const byFolderOrder = (a: Folder, b: Folder) => rank(a) - rank(b) || (a.name || '').localeCompare(b.name || '', 'ko', { numeric: true });
let tmpSeq = 0;

type Menu = { x: number, y: number, type: 'folder' | 'item' | 'background', id: string | null };
type MoveTarget = { kind: 'folder', id: string } | { kind: 'items', ids: string[] };

export default function FolderExplorer({ onItemSelect, onGroupSelect, selectedIds = [], filterType = 'all', initialData, refreshKey = 0, onGetViewItems }: FolderExplorerProps) {
    // 폴더는 전체 나무(mode=all)를 한 번에 받아 둔다 — 보이는 폴더 목록은 여기서 바로 뽑는다(다시 안 불러도 됨)
    const [allFolders, setAllFolders] = useState<Folder[]>(initialData?.folders || []);
    // 폴더별 시험지 목록(키 = 폴더 id, 맨 바깥은 'root') — 한 번 연 폴더는 다시 안 불러온다
    const [itemsBy, setItemsBy] = useState<Record<string, UserItem[]>>(() => (initialData?.items ? { [ROOT]: initialData.items as UserItem[] } : {}) as Record<string, UserItem[]>);
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const curRef = useRef<string | null>(null); curRef.current = currentFolderId;
    const [loadingKey, setLoadingKey] = useState<string | null>(null);
    const [reloadTick, setReloadTick] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<UserItem[] | null>(null);
    const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<Menu | null>(null);
    const [clipboard, setClipboard] = useState<{ type: 'folder' | 'item', id: string } | null>(null);
    const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
    const [notice, setNotice] = useState<{ text: string, error?: boolean } | null>(null);
    const noticeTimer = useRef<any>(null);
    const [inputModal, setInputModal] = useState<{ isOpen: boolean; title: string; label: string; initialValue: string; icon: 'folder' | 'edit'; onConfirm: (val: string) => void; }>({ isOpen: false, title: '', label: '', initialValue: '', icon: 'edit', onConfirm: () => { } });

    const say = (text: string, error = false) => {
        setNotice({ text, error });
        clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(null), error ? 6000 : 2500);
    };
    useEffect(() => () => clearTimeout(noticeTimer.current), []);

    // ── 불러오기 ─────────────────────────────────────────────
    // 처음·새로고침: 폴더 나무 + 맨 바깥 시험지. 보던 폴더는 그대로 두고, 그 폴더 목록만 다시 받는다.
    const typeParam = filterType === 'all' ? '' : `&folderType=${filterType}`;
    const loadFolder = async (fid: string | null) => {
        const k = keyOf(fid);
        setLoadingKey(k);
        try {
            const res = await fetch(`/api/storage/folders?parentId=${fid ?? 'root'}${typeParam}`);
            const data = await res.json();
            if (!res.ok) throw Error(data.error);
            setItemsBy(p => ({ ...p, [k]: data.items || [] }));
        } catch { say('폴더 내용을 불러오지 못했습니다. 새로고침을 눌러 주세요.', true); }
        finally { setLoadingKey(c => c === k ? null : c); }
    };
    const firstLoad = useRef(true);
    useEffect(() => {
        if (firstLoad.current && initialData && reloadTick === 0 && refreshKey === 0) { firstLoad.current = false; return; }
        firstLoad.current = false;
        let alive = true;
        // [2026-09-14 전수조사] 이 탐색기는 시험지 출제 화면의 (숨겨진) 보관함 모달 안에 항상 마운트돼
        //   비로그인 방문자도 진입마다 /api/storage/folders 를 불러 401 을 받았다. 세션 없으면 안 부른다.
        createClient().auth.getSession().then(({ data: { session } }) => {
            if (!session || !alive) return;
            setLoadingKey(ROOT);
            fetch(`/api/storage/folders?mode=all${typeParam}`)
                .then(res => res.json())
                .then(data => {
                    if (!alive) return;
                    const folders: Folder[] = data.folders || [];
                    setAllFolders(folders);
                    // 다른 폴더 캐시는 버리고(밖에서 바뀌었을 수 있다) 맨 바깥만 새로 채운다
                    setItemsBy({ [ROOT]: data.items || [] });
                    const cur = curRef.current;
                    if (cur && !folders.some(f => f.id === cur)) setCurrentFolderId(null);   // 보던 폴더가 없어졌으면 바깥으로
                    else if (cur) void loadFolder(cur);                                       // 보던 폴더에 그대로 머문다
                })
                .catch(() => say('보관함을 불러오지 못했습니다.', true))
                .finally(() => { if (alive) setLoadingKey(c => c === ROOT ? null : c); });
        });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reloadTick, refreshKey, filterType, initialData]);

    // 폴더에 들어가면 처음 한 번만 그 폴더 시험지를 받는다
    useEffect(() => {
        if (currentFolderId === null || itemsBy[currentFolderId]) return;
        void loadFolder(currentFolderId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentFolderId]);

    useEffect(() => {
        if (!searchQuery.trim()) { setSearchResults(null); return; }
        const timer = setTimeout(async () => {
            const itemType = filterType === 'db' ? 'personal_db' : 'saved_exam';
            const res = await fetch(`/api/storage/items?type=${itemType}&search=${encodeURIComponent(searchQuery.trim())}`);
            const data = await res.json();
            setSearchResults(data.items || []);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, filterType]);

    const curKey = keyOf(currentFolderId);
    const viewFolders = useMemo(() => allFolders.filter(f => (f.parent_id ?? null) === currentFolderId).sort(byFolderOrder), [allFolders, currentFolderId]);
    const viewItems = itemsBy[curKey] || NONE;
    const filteredItems = searchResults !== null ? searchResults : viewItems;
    const loading = loadingKey === curKey && !itemsBy[curKey];

    useEffect(() => { if (onGetViewItems) onGetViewItems(filteredItems); }, [filteredItems]);   // eslint-disable-line react-hooks/exhaustive-deps

    // ── 바꾸기(화면 먼저, 서버는 뒤에서) ───────────────────────
    const send = async (url: string, method: string, body?: any) => {
        // keepalive — 옮기자마자 창을 닫거나 다른 페이지로 가도 저장 요청이 끝까지 간다
        const res = await fetch(url, { method, keepalive: true, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
        let data: any = {};
        try { data = await res.json(); } catch { }
        if (!res.ok) throw Error(data.error || '저장하지 못했습니다');
        return data;
    };
    const failed = (what: string, e: any) => { say(`${what}에 실패했습니다. 원래대로 되돌렸어요. (${e?.message || '오류'})`, true); setReloadTick(t => t + 1); };
    const folderName = (id: string | null) => id === null ? '내 보관함' : allFolders.find(f => f.id === id)?.name || '폴더';
    const descendants = (id: string) => {
        const out = new Set<string>([id]);
        let grew = true;
        while (grew) { grew = false; for (const f of allFolders) if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) { out.add(f.id); grew = true; } }
        return out;
    };
    const isUserFolder = (id: string) => { const f = allFolders.find(x => x.id === id); return !!f && !isVirtualFolder(f) && !isNaesinFolder(f.name); };

    // 방금 만든 폴더는 서버가 진짜 id 를 줄 때까지 임시 id(tmp-…)로 보인다. 그 사이에 들어가거나 그 안에 또 만들면
    //   진짜 id 를 기다렸다가 이어 간다(예전 방식이면 임시 폴더에 들어간 채로 id 가 바뀌어 맨 바깥으로 튕겼다).
    const pendingIds = useRef<Record<string, Promise<string | null>>>({});
    const realId = async (id: string | null) => (id && id.startsWith('tmp-') ? await (pendingIds.current[id] ?? Promise.resolve(null)) : id);
    const createFolderNamed = async (name: string, parentId: string | null) => {
        const tmp: Folder = { id: `tmp-${++tmpSeq}`, name, parent_id: parentId, created_at: new Date().toISOString(), user_id: '', folder_type: filterType === 'all' ? 'exam' : filterType };
        setAllFolders(p => [...p, tmp]);
        setItemsBy(p => ({ ...p, [tmp.id]: [] }));
        let resolve!: (v: string | null) => void;
        pendingIds.current[tmp.id] = new Promise(r => { resolve = r; });
        try {
            const parent = await realId(parentId);
            if (parentId && !parent) throw Error('위 폴더를 만들지 못했습니다');
            const { data } = await send('/api/storage/folders', 'POST', { name, parentId: parent ?? 'root', folderType: tmp.folder_type });
            setAllFolders(p => p.map(f => f.id === tmp.id ? { ...tmp, ...data } : f.parent_id === tmp.id ? { ...f, parent_id: data.id } : f));
            setItemsBy(p => { const { [tmp.id]: _gone, ...rest } = p; return { ...rest, [data.id]: [] }; });
            setCurrentFolderId(c => c === tmp.id ? data.id : c);
            resolve(data.id);
        } catch (e) {
            resolve(null);
            setAllFolders(p => p.filter(f => f.id !== tmp.id));
            setCurrentFolderId(c => c === tmp.id ? parentId : c);
            failed('폴더 만들기', e);
        } finally { delete pendingIds.current[tmp.id]; }
    };
    const handleCreateFolder = () => {
        const parentId = currentFolderId;   // 누른 순간의 폴더 — 이름 입력 중에 바뀌어도 여기에 만든다
        setInputModal({
            isOpen: true, title: '새 폴더', label: `‘${folderName(parentId)}’ 안에 만들 폴더 이름`, initialValue: '', icon: 'folder',
            onConfirm: (name: string) => { setInputModal(p => ({ ...p, isOpen: false })); void createFolderNamed(name, parentId); },
        });
    };

    const renameTo = async (type: 'folder' | 'item', id: string, newName: string) => {
        if (type === 'folder') setAllFolders(p => p.map(f => f.id === id ? { ...f, name: newName } : f));
        else setItemsBy(p => Object.fromEntries(Object.entries(p).map(([k, list]) => [k, list.map(i => i.id === id ? { ...i, name: newName } : i)])));
        setSearchResults(p => p && p.map(i => i.id === id ? { ...i, name: newName } : i));
        try { await send(type === 'folder' ? '/api/storage/folders' : '/api/storage/items', 'PATCH', { id, name: newName }); }
        catch (e) { failed('이름 바꾸기', e); }
    };
    const startRename = (type: 'folder' | 'item', id: string) => {
        const currentName = type === 'folder' ? allFolders.find(f => f.id === id)?.name || '' : (filteredItems.find(i => i.id === id) || viewItems.find(i => i.id === id))?.name || '';
        setInputModal({
            isOpen: true, title: '이름 바꾸기', label: '새 이름', initialValue: currentName, icon: 'edit',
            onConfirm: (newName: string) => { setInputModal(p => ({ ...p, isOpen: false })); if (newName && newName !== currentName) void renameTo(type, id, newName); },
        });
    };

    const handleDelete = async (type: 'folder' | 'item', id: string) => {
        if (type === 'folder') {
            if (!isUserFolder(id)) return;
            // 폴더 삭제: 안에 시험지가 있으면 "함께 삭제됨"을 안내하고 확인받는다. (비어있으면 단순 확인)
            let examCount = 0;
            try { const res = await fetch(`/api/storage/folders?countItems=${id}`); if (res.ok) examCount = (await res.json()).examCount || 0; } catch { }
            const msg = examCount > 0
                ? `이 폴더 안에 시험지 ${examCount}개가 들어 있습니다.\n폴더를 삭제하면 안의 시험지도 모두 함께 삭제됩니다.\n\n정말 삭제하시겠습니까?`
                : `‘${folderName(id)}’ 폴더를 삭제하시겠습니까?`;
            if (!confirm(msg)) return;
            const gone = descendants(id);
            setAllFolders(p => p.filter(f => !gone.has(f.id)));
            setItemsBy(p => Object.fromEntries(Object.entries(p).filter(([k]) => !gone.has(k))));
            if (currentFolderId && gone.has(currentFolderId)) setCurrentFolderId(allFolders.find(f => f.id === id)?.parent_id ?? null);
            try { await send(`/api/storage/folders?id=${id}`, 'DELETE'); say('폴더를 삭제했어요.'); } catch (e) { failed('폴더 삭제', e); }
            return;
        }
        if (!confirm('이 시험지를 삭제하시겠습니까?')) return;
        setItemsBy(p => Object.fromEntries(Object.entries(p).map(([k, list]) => [k, list.filter(i => i.id !== id)])));
        setSearchResults(p => p && p.filter(i => i.id !== id));
        try { await send(`/api/storage/items?id=${id}`, 'DELETE'); } catch (e) { failed('삭제', e); }
    };

    // 시험지 옮기기 — 여러 개를 한 번에(서버도 한 번에)
    const moveItems = async (ids: string[], targetFolderId: string | null) => {
        const tk = keyOf(targetFolderId);
        const moving: UserItem[] = [];
        for (const list of Object.values(itemsBy)) for (const i of list) if (ids.includes(i.id) && !moving.some(m => m.id === i.id)) moving.push(i);
        for (const i of searchResults || []) if (ids.includes(i.id) && !moving.some(m => m.id === i.id)) moving.push(i);
        const real = moving.filter(i => (i.folder_id ?? null) !== targetFolderId);
        if (!real.length) return;
        const realIds = real.map(i => i.id);
        setItemsBy(p => {
            const next: Record<string, UserItem[]> = {};
            for (const [k, list] of Object.entries(p)) next[k] = list.filter(i => !realIds.includes(i.id));
            if (p[tk]) next[tk] = [...real.map(i => ({ ...i, folder_id: targetFolderId as any })), ...next[tk]];
            return next;
        });
        setSearchResults(p => p && p.map(i => realIds.includes(i.id) ? { ...i, folder_id: targetFolderId as any } : i));
        try {
            await send('/api/storage/items', 'PATCH', { ids: realIds, folderId: targetFolderId ?? 'root' });
            say(`${real.length}개를 ‘${folderName(targetFolderId)}’(으)로 옮겼어요.`);
        } catch (e) { failed('옮기기', e); }
    };
    const handleMoveItem = (itemId: string, targetFolderId: string | null) => {
        // 끌어 온 시험지가 체크된 것 중 하나면 체크된 것을 모두 옮긴다(윈도우 탐색기처럼)
        const selectedHere = filteredItems.filter(i => i.type === 'saved_exam' && selectedIds.includes(i.id)).map(i => i.id);
        void moveItems(selectedHere.includes(itemId) ? selectedHere : [itemId], targetFolderId);
    };
    const moveFolder = async (id: string, targetFolderId: string | null) => {
        if (!isUserFolder(id)) return;
        if (targetFolderId && descendants(id).has(targetFolderId)) { say('폴더를 자기 안으로는 옮길 수 없어요.', true); return; }
        const before = allFolders.find(f => f.id === id);
        if (!before || (before.parent_id ?? null) === targetFolderId) return;
        setAllFolders(p => p.map(f => f.id === id ? { ...f, parent_id: targetFolderId } : f));
        try { await send('/api/storage/folders', 'PATCH', { id, parentId: targetFolderId ?? 'root' }); say(`‘${before.name}’ 폴더를 ‘${folderName(targetFolderId)}’(으)로 옮겼어요.`); }
        catch (e) { failed('폴더 옮기기', e); }
    };
    const handleDropMove = (data: { type: 'folder' | 'item', id: string }, targetFolderId: string | null) => {
        if (targetFolderId && (targetFolderId.startsWith('tmp-') || !isUserFolder(targetFolderId))) return;
        if (data.type === 'item') handleMoveItem(data.id, targetFolderId);
        else if (data.id !== targetFolderId) void moveFolder(data.id, targetFolderId);
    };

    const handlePaste = async () => {
        if (!clipboard) return;
        if (clipboard.type === 'item') await moveItems([clipboard.id], currentFolderId);
        else await moveFolder(clipboard.id, currentFolderId);
        setClipboard(null);
    };
    const handleSync = async () => {
        if (!confirm('구매한 DB 목록을 보관함으로 가져오시겠습니까?')) return;
        try {
            const data = await send('/api/storage/sync', 'POST');
            if (data.count >= 0) { say(`${data.count}개의 새로운 DB를 보관함으로 가져왔습니다.`); setReloadTick(t => t + 1); }
        } catch { say('가져오기에 실패했습니다.', true); }
    };
    const download = (id: string) => void downloadSavedExam(id).catch((e) => alert(e?.message || 'PDF를 받지 못했습니다.'));

    const selectedHereIds = filterType === 'exam' ? filteredItems.filter(i => i.type === 'saved_exam' && selectedIds.includes(i.id)).map(i => i.id) : [];
    const getBreadcrumbs = () => {
        const path: { id: string | null, name: string }[] = [];
        let curr: Folder | undefined = currentFolderId ? allFolders.find(f => f.id === currentFolderId) : undefined;
        while (curr) { path.unshift({ id: curr.id, name: curr.name }); const pid = curr.parent_id; curr = pid ? allFolders.find(f => f.id === pid) : undefined; }
        path.unshift({ id: null, name: '내 보관함' });
        return path;
    };
    const breadcrumbs = getBreadcrumbs();
    const currentFolderName = breadcrumbs[breadcrumbs.length - 1]?.name || '내 보관함';
    const openMenu = (e: React.MouseEvent, type: Menu['type'], id: string | null) => setContextMenu({ x: e.clientX, y: e.clientY, type, id });
    const dropData = (e: React.DragEvent) => { try { return JSON.parse(e.dataTransfer.getData('application/json')); } catch { return null; } };
    const canEdit = (type: 'folder' | 'item', id: string | null) => !!id && (type === 'item' || isUserFolder(id));

    return (
        <div className="flex h-full border border-[#ECEFF2] rounded-[20px] overflow-hidden bg-white relative">

            {/* ── 데스크탑: 좌측 탐색기 사이드바 ── */}
            <div className="hidden md:flex w-64 bg-[#F7F8FA] border-r border-[#ECEFF2] flex-col">
                <div className="px-4 py-3 border-b border-[#ECEFF2] flex items-center justify-between">
                    <span className="font-extrabold text-[#17202C] text-sm">탐색기</span>
                    <button onClick={() => setReloadTick(t => t + 1)} aria-label="새로고침" className="p-1.5 rounded-lg text-[#B0B8C1] hover:text-[#1B7E7A] hover:bg-white">
                        <RefreshCw size={14} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    <FolderTree folders={allFolders} currentFolderId={currentFolderId} onFolderSelect={(id) => { setCurrentFolderId(id); setSearchQuery(''); }}
                        onDropMove={handleDropMove} onDelete={handleDelete} onContextMenu={openMenu} />
                </div>
            </div>

            {/* ── 메인 콘텐츠 영역 ── */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* 모바일: 현재 폴더 위치 + 폴더 선택 버튼 */}
                <div className="md:hidden flex items-center gap-2 px-3 py-2 bg-white border-b border-[#ECEFF2]">
                    <button onClick={() => setMobileTreeOpen(true)} className="flex items-center gap-2 flex-1 min-w-0 bg-[#F2F4F6] rounded-xl px-3 min-h-[44px] text-sm text-left hover:bg-[#E7EAEE]">
                        <FolderIcon size={15} className="text-[#3AADA9] flex-shrink-0" />
                        <span className="font-bold text-[#17202C] truncate">{currentFolderName}</span>
                        <ChevronRight size={14} className="text-slate-400 flex-shrink-0 ml-auto" />
                    </button>
                    {filterType !== 'db' && (
                        <button onClick={handleCreateFolder} aria-label="새 폴더" className="p-2.5 rounded-xl text-[#1B7E7A] bg-[#E8F6F5] flex-shrink-0"><FolderPlus size={16} /></button>
                    )}
                    <button onClick={() => setReloadTick(t => t + 1)} aria-label="새로고침" className="p-2.5 rounded-xl text-[#B0B8C1] hover:text-[#1B7E7A] hover:bg-[#F7F8FA] flex-shrink-0">
                        <RefreshCw size={15} />
                    </button>
                </div>

                {/* 데스크탑: 브레드크럼(끌어 놓으면 그 폴더로 옮겨짐) + 버튼 */}
                <div className="hidden md:flex border-b border-[#ECEFF2] flex-col bg-white">
                    <div className="h-14 flex items-center px-4 justify-between gap-2">
                        <div className="flex items-center gap-1 text-sm font-semibold text-[#5F6B78] min-w-0 flex-1 overflow-hidden">
                            {breadcrumbs.map((crumb, idx) => (
                                <React.Fragment key={crumb.id || 'root'}>
                                    {idx > 0 && <span className="text-slate-300 flex-shrink-0">/</span>}
                                    <button className={`hover:text-[#1B7E7A] truncate max-w-[140px] rounded px-1 ${crumb.id === currentFolderId ? 'font-extrabold text-[#17202C]' : ''}`}
                                        onClick={() => { setCurrentFolderId(crumb.id); setSearchQuery(''); }}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => { e.preventDefault(); const d = dropData(e); if (d) handleDropMove(d, crumb.id); }}>{crumb.name}</button>
                                </React.Fragment>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {selectedHereIds.length > 0 && (
                                <button onClick={() => setMoveTarget({ kind: 'items', ids: selectedHereIds })} className="rd-btn rd-btn-gray rd-btn-sm"><FolderInput size={16} /> 선택 {selectedHereIds.length}개 옮기기</button>
                            )}
                            {/* 「가져오기」는 구매한 DB를 보관함에 넣는 버튼 — 시험지 창엔 상관없어 숨긴다 */}
                            {filterType !== 'exam' && <button onClick={handleSync} className="rd-btn rd-btn-gray rd-btn-sm"><DownloadCloud size={16} /> 가져오기</button>}
                            {filterType !== 'db' && <button onClick={handleCreateFolder} className="rd-btn rd-btn-tint rd-btn-sm"><FolderPlus size={16} /> 새 폴더</button>}
                        </div>
                    </div>
                </div>

                {/* 검색창 */}
                <div className="px-3 py-2.5 border-b border-[#ECEFF2] bg-white">
                    <div className="relative">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8B95A1]" />
                        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="학교명, 연도 등으로 검색..."
                            className="rd-input" style={{ minHeight: 44, fontSize: 15, paddingLeft: 38, paddingRight: 36 }} />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} aria-label="검색어 지우기" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={13} /></button>
                        )}
                    </div>
                    {selectedHereIds.length > 0 && (
                        <button onClick={() => setMoveTarget({ kind: 'items', ids: selectedHereIds })} className="md:hidden mt-2 w-full rd-btn rd-btn-gray rd-btn-sm"><FolderInput size={16} /> 선택한 {selectedHereIds.length}개 폴더로 옮기기</button>
                    )}
                </div>

                {/* 파일 그리드 */}
                <div className="flex-1 overflow-y-auto bg-white relative" onClick={() => setContextMenu(null)}
                    onContextMenu={(e) => { e.preventDefault(); if (filterType !== 'db') openMenu(e, 'background', null); }}>
                    {loading ? (
                        <div className="p-3 space-y-2 animate-pulse" aria-label="불러오는 중">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 bg-white border border-slate-100 rounded-lg px-3 py-2.5">
                                    <div className="w-5 h-5 rounded bg-slate-200 shrink-0" />
                                    <div className="h-3.5 rounded bg-slate-200" style={{ width: `${55 - (i % 4) * 8}%` }} />
                                    <div className="ml-auto h-3 w-16 rounded bg-slate-100 hidden sm:block" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <FileGrid
                            folders={searchQuery ? [] : viewFolders}
                            items={filteredItems}
                            onFolderClick={(f) => { setCurrentFolderId(f.id); setSearchQuery(''); }}
                            onItemClick={onItemSelect}
                            onRename={() => { }}
                            onDelete={handleDelete}
                            onContextMenu={openMenu}
                            onMoveItem={handleMoveItem}
                            onDropMove={handleDropMove}
                            canEditFolder={isUserFolder}
                            selectedIds={selectedIds}
                            onGroupSelect={onGroupSelect}
                        />
                    )}
                </div>
                {notice && (
                    <p role={notice.error ? 'alert' : 'status'} className={`absolute left-1/2 -translate-x-1/2 bottom-3 z-30 max-w-[90%] rounded-xl px-4 py-2 text-sm font-semibold shadow-lg ${notice.error ? 'bg-red-600 text-white' : 'bg-[#17202C] text-white'}`}>
                        {notice.text}
                    </p>
                )}
            </div>

            {/* ── 모바일: 폴더 탐색기 Bottom Sheet ── */}
            {mobileTreeOpen && (
                <>
                    <div className="fixed inset-0 z-50 bg-black/50 md:hidden" onClick={() => setMobileTreeOpen(false)} />
                    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[28px] shadow-2xl md:hidden flex flex-col max-h-[70dvh]">
                        <div className="flex items-center justify-between px-4 pt-6 pb-3 border-b border-[#ECEFF2]">
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-1 bg-[#D5DAE0] rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2.5" />
                                <FolderIcon size={16} className="text-[#3AADA9]" />
                                <span className="font-extrabold text-[#17202C] text-base">폴더 선택</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {filterType !== 'exam' && <button onClick={handleSync} className="text-xs font-bold text-[#4E5968] bg-[#F2F4F6] px-2.5 min-h-[32px] rounded-lg flex items-center gap-1"><DownloadCloud size={12} /> 가져오기</button>}
                                {filterType !== 'db' && <button onClick={() => { setMobileTreeOpen(false); handleCreateFolder(); }} className="text-xs font-bold text-[#1B7E7A] bg-[#E8F6F5] px-2.5 min-h-[32px] rounded-lg flex items-center gap-1"><FolderPlus size={12} /> 새 폴더</button>}
                                <button onClick={() => setMobileTreeOpen(false)} aria-label="닫기" className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} className="text-slate-500" /></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3">
                            <FolderTree folders={allFolders} currentFolderId={currentFolderId}
                                onFolderSelect={(id) => { setCurrentFolderId(id); setSearchQuery(''); setMobileTreeOpen(false); }}
                                onDropMove={handleDropMove} onDelete={handleDelete} onContextMenu={openMenu} />
                        </div>
                    </div>
                </>
            )}

            {contextMenu && (
                <StorageContextMenu
                    x={contextMenu.x} y={contextMenu.y} type={contextMenu.type} clipboardHasData={!!clipboard}
                    canEdit={contextMenu.type === 'background' ? filterType !== 'db' : canEdit(contextMenu.type, contextMenu.id)}
                    canDownload={contextMenu.type === 'item' && filterType !== 'db'}
                    onClose={() => setContextMenu(null)}
                    onRename={() => contextMenu.id && contextMenu.type !== 'background' && startRename(contextMenu.type, contextMenu.id)}
                    onDelete={() => contextMenu.id && contextMenu.type !== 'background' && void handleDelete(contextMenu.type, contextMenu.id)}
                    onDownload={() => contextMenu.id && download(contextMenu.id)}
                    onCreateFolder={handleCreateFolder}
                    onMove={() => {
                        if (!contextMenu.id || contextMenu.type === 'background') return;
                        if (contextMenu.type === 'folder') setMoveTarget({ kind: 'folder', id: contextMenu.id });
                        else setMoveTarget({ kind: 'items', ids: selectedHereIds.includes(contextMenu.id) ? selectedHereIds : [contextMenu.id] });
                    }}
                    onCut={() => contextMenu.id && contextMenu.type !== 'background' && setClipboard({ type: contextMenu.type, id: contextMenu.id })}
                    onPaste={() => void handlePaste()}
                />
            )}
            {moveTarget && (
                <MoveToFolderModal
                    folders={allFolders.filter(f => isUserFolder(f.id) && !f.id.startsWith('tmp-'))}
                    title={moveTarget.kind === 'folder' ? `‘${folderName(moveTarget.id)}’ 폴더 옮기기` : `시험지 ${moveTarget.ids.length}개 옮기기`}
                    disabledIds={moveTarget.kind === 'folder' ? descendants(moveTarget.id) : new Set()}
                    currentId={moveTarget.kind === 'folder' ? (allFolders.find(f => f.id === moveTarget.id)?.parent_id ?? null) : currentFolderId}
                    onClose={() => setMoveTarget(null)}
                    onCreateFolder={async (name, parentId) => { await createFolderNamed(name, parentId); }}
                    onPick={(target) => {
                        const t = moveTarget; setMoveTarget(null);
                        if (t.kind === 'folder') void moveFolder(t.id, target); else void moveItems(t.ids, target);
                    }}
                />
            )}
            {inputModal.isOpen && <InputModal title={inputModal.title} label={inputModal.label} initialValue={inputModal.initialValue} icon={inputModal.icon} onClose={() => setInputModal(p => ({ ...p, isOpen: false }))} onConfirm={inputModal.onConfirm} />}
        </div>
    );
}
