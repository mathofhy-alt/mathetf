import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
    try {
        const supabase = createClient();
        const { searchParams } = new URL(req.url);
        const mode = searchParams.get('mode'); // 'all' for tree + root content or just tree
        const parentId = searchParams.get('parentId'); // 'root' or UUID
        const folderType = searchParams.get('folderType'); // 'db' | 'exam' (Optional filtering)

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

            // Inject Virtual Folder for Mock Exams
            if (!folderType || folderType === 'all' || folderType === 'db') {
                treeFolders.push({
                    id: 'mock-exam-root',
                    name: '모의고사',
                    parent_id: null,
                    folder_type: 'db' // Shows up natively as a DB folder
                } as any);
            }

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

    const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
