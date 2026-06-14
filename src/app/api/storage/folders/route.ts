import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// 주어진 폴더 + 모든 하위 폴더(중첩 포함)의 id 목록을 반환
async function getFolderSubtreeIds(supabase: any, userId: string, rootId: string): Promise<string[]> {
    const { data: all } = await supabase
        .from('folders')
        .select('id, parent_id')
        .eq('user_id', userId);
    const childrenMap = new Map<string, string[]>();
    for (const f of (all || [])) {
        const p = f.parent_id || '__root__';
        if (!childrenMap.has(p)) childrenMap.set(p, []);
        childrenMap.get(p)!.push(f.id);
    }
    const result: string[] = [rootId];
    const stack = [rootId];
    while (stack.length) {
        const cur = stack.pop()!;
        for (const c of (childrenMap.get(cur) || [])) { result.push(c); stack.push(c); }
    }
    return result;
}

export async function GET(req: NextRequest) {
    try {
        const supabase = createClient();
        const { searchParams } = new URL(req.url);
        const mode = searchParams.get('mode'); // 'all' for tree + root content or just tree
        const parentId = searchParams.get('parentId'); // 'root' or UUID
        const folderType = searchParams.get('folderType'); // 'db' | 'exam' (Optional filtering)

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // 폴더 삭제 전 안내용: 폴더(및 하위 폴더)에 들어있는 시험지/전체 항목 수 반환
        const countItems = searchParams.get('countItems');
        if (countItems) {
            const folderIds = await getFolderSubtreeIds(supabase, user.id, countItems);
            const { count: examCount } = await supabase
                .from('user_items')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('type', 'saved_exam')
                .in('folder_id', folderIds);
            const { count: totalCount } = await supabase
                .from('user_items')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .in('folder_id', folderIds);
            return NextResponse.json({ examCount: examCount || 0, totalCount: totalCount || 0 });
        }

        // 0. Fetch Mock Exam IDs to globally exclude them from personal folders
        const { data: mockExamsGlobal } = await supabase
            .from('exam_materials')
            .select('id')
            .eq('exam_type', '모의고사');
        const mockExamIds = new Set(mockExamsGlobal?.map((m: any) => m.id) || []);

        // 1. Prepare Base Queries with Selective Select
        let folderQuery = supabase
            .from('folders')
            .select('id, name, parent_id, folder_type')
            .eq('user_id', user.id);

        let itemQuery = supabase
            .from('user_items')
            .select('id, folder_id, type, name, reference_id, details, created_at')
            .eq('user_id', user.id);

        // 2. Apply folderType Filter
        if (folderType && folderType !== 'all') {
            folderQuery = folderQuery.eq('folder_type', folderType);
            if (folderType === 'exam') itemQuery = itemQuery.eq('type', 'saved_exam');
            else if (folderType === 'db') itemQuery = itemQuery.eq('type', 'personal_db');
        }

        // 3. Unified Mode 'all' (Tree + Root Content)
        if (mode === 'all') {
            // In 'all' mode, we usually need the WHOLE tree for the sidebar
            // AND the ROOT content for the initial grid view to avoid 2 calls.
            let treeQuery = supabase
                .from('folders')
                .select('id, name, parent_id, folder_type')
                .eq('user_id', user.id)
                .order('name');

            // Optionally filter tree by type too if requested
            if (folderType && folderType !== 'all') treeQuery = treeQuery.eq('folder_type', folderType);

            // Fetch root items specifically
            const rootItemQuery = supabase
                .from('user_items')
                .select('id, folder_id, type, name, reference_id, details, created_at')
                .eq('user_id', user.id)
                .is('folder_id', null)
                .order('created_at', { ascending: false });

            if (folderType && folderType === 'exam') rootItemQuery.eq('type', 'saved_exam');
            else if (folderType && folderType === 'db') rootItemQuery.eq('type', 'personal_db');

            const [treeRes, rootItemsRes] = await Promise.all([treeQuery, rootItemQuery]);

            let treeFolders = treeRes.data || [];
            let allItems = (rootItemsRes.data || []).filter(item => !mockExamIds.has(item.reference_id));

            // Inject Virtual Folders for free exams (Mock + 사관학교/경찰대 입학시험)
            if (!folderType || folderType === 'all' || folderType === 'db') {
                treeFolders.push({
                    id: 'mock-exam-root',
                    name: '모의고사',
                    parent_id: null,
                    folder_type: 'db' // Shows up natively as a DB folder
                } as any);
                treeFolders.push({
                    id: 'exam-school-root',
                    name: '사관학교·경찰대',
                    parent_id: null,
                    folder_type: 'db'
                } as any);
            }

            // 폴더 표시 순서 고정: 모의고사 → 사관학교·경찰대 → 구매한 학교 기출 → 기타
            const folderRank = (n: string) =>
                n === '모의고사' ? 0 : n === '사관학교·경찰대' ? 1 : n === '구매한 학교 기출' ? 2 : 3;
            treeFolders = [...treeFolders].sort((a: any, b: any) =>
                folderRank(a.name) - folderRank(b.name) || (a.name || '').localeCompare(b.name || ''));

            return NextResponse.json({
                folders: treeFolders, // Tree folders
                items: allItems, // Root items
                isUnified: true
            });
        }

        // 4. Content Fetch for specific folder (Context Navigation)
        if (parentId === 'mock-exam-root') {
             const { data: mockExams } = await supabase.from('exam_materials')
                 .select('id, title, created_at')
                 .eq('exam_type', '모의고사')
                 .eq('file_type', 'DB');
             
             if (mockExams) {
                 const mockItems = mockExams.map(m => ({
                     id: m.id,
                     folder_id: 'mock-exam-root',
                     type: 'personal_db',
                     name: m.title,
                     reference_id: m.id,
                     details: { is_mock: true },
                     created_at: m.created_at
                 }));
                 return NextResponse.json({ folders: [], items: mockItems });
             }
             return NextResponse.json({ folders: [], items: [] });
        }

        // 사관학교·경찰대 입학시험 (무료) 가상 폴더 내용
        if (parentId === 'exam-school-root') {
            const { data: examSchool } = await supabase.from('exam_materials')
                .select('id, title, created_at')
                .eq('exam_type', '입학시험')
                .eq('file_type', 'DB');
            if (examSchool) {
                const items = examSchool.map(m => ({
                    id: m.id,
                    folder_id: 'exam-school-root',
                    type: 'personal_db',
                    name: m.title,
                    reference_id: m.id,
                    details: { is_free: true },
                    created_at: m.created_at
                }));
                return NextResponse.json({ folders: [], items });
            }
            return NextResponse.json({ folders: [], items: [] });
        }

        if (parentId === 'root' || !parentId) {
            folderQuery = folderQuery.is('parent_id', null);
            itemQuery = itemQuery.is('folder_id', null);
        } else {
            folderQuery = folderQuery.eq('parent_id', parentId);
            itemQuery = itemQuery.eq('folder_id', parentId);
        }

        const [foldersRes, itemsRes] = await Promise.all([
            folderQuery.order('name', { ascending: true }),
            itemQuery.order('created_at', { ascending: false })
        ]);

        if (foldersRes.error) return NextResponse.json({ error: foldersRes.error.message }, { status: 500 });
        if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });

        return NextResponse.json({
            folders: foldersRes.data || [],
            items: (itemsRes.data || []).filter(item => !mockExamIds.has(item.reference_id))
        });

    } catch (e: any) {
        console.error('[StorageFoldersAPI] Fatal Error:', e);
        return NextResponse.json({ error: `Server Runtime Error: ${e.message}` }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { name, parentId, folderType } = body;

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const { data, error } = await supabase
        .from('folders')
        .insert({
            user_id: user.id,
            name,
            parent_id: parentId === 'root' ? null : parentId,
            folder_type: folderType || 'exam'
        })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest) {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { id, name, parentId } = body;

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const updateData: any = {};
    if (name) updateData.name = name;
    if (parentId !== undefined) updateData.parent_id = parentId === 'root' ? null : parentId;

    const { data, error } = await supabase
        .from('folders')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest) {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    // 폴더(및 하위 폴더) 안의 시험지 스토리지 파일을 먼저 정리한다.
    // (DB 행은 folder_id CASCADE로 자동 삭제되지만 .hml/.json 파일은 안 지워져 고아가 쌓이는 문제 해결)
    let deletedExams = 0;
    let cascadedExams: any[] = [];
    try {
        const folderIds = await getFolderSubtreeIds(supabase, user.id, id);
        const { data: exams } = await supabase
            .from('user_items')
            .select('id, name, reference_id')
            .eq('user_id', user.id)
            .eq('type', 'saved_exam')
            .in('folder_id', folderIds);
        if (exams && exams.length > 0) {
            cascadedExams = exams;
            deletedExams = exams.length;
            const paths: string[] = [];
            for (const e of exams) {
                if (e.reference_id) {
                    paths.push(`${user.id}/${e.reference_id}.hml`, `${user.id}/${e.reference_id}.json`);
                }
            }
            if (paths.length > 0) {
                const { error: stErr } = await supabase.storage.from('exams').remove(paths);
                if (stErr) console.warn('[FolderDelete] storage cleanup warning:', stErr.message);
            }
        }
    } catch (e: any) {
        console.warn('[FolderDelete] storage cleanup skipped:', e?.message);
    }

    // 폴더 삭제 (DB CASCADE가 하위 폴더 + 항목 행을 함께 제거)
    const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 삭제 감사 로그: 폴더 삭제로 함께 사라진 시험지 기록 (best-effort)
    try {
        const rows: any[] = cascadedExams.map((e: any) => ({
            user_id: user.id, item_type: 'saved_exam', item_id: e.id,
            item_name: e.name ?? null, reference_id: e.reference_id ?? null,
            reason: 'folder_delete_cascade', context: { folder_id: id }
        }));
        rows.push({
            user_id: user.id, item_type: 'folder', item_id: id, item_name: null,
            reference_id: null, reason: 'user_delete_folder', context: { exam_count: deletedExams }
        });
        await supabase.from('deletion_audit').insert(rows);
    } catch (e: any) { console.warn('[DeletionAudit] folder log failed:', e?.message); }

    return NextResponse.json({ success: true, deletedExams });
}
