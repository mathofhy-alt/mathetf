import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
    try {
        const supabase = createClient();
        const { searchParams } = new URL(req.url);
        const mode = searchParams.get('mode'); // 'all' for tree
        const parentId = searchParams.get('parentId'); // 'root' or UUID
        const folderType = searchParams.get('folderType'); // 'db' | 'exam' (Optional filtering)

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // 1. Prepare Base Queries
        let folderQuery = supabase
            .from('folders')
            .select('*')
            .eq('user_id', user.id);

        let itemQuery = supabase
            .from('user_items')
            .select('*')
            .eq('user_id', user.id);

        // 2. Apply folderType Filter (Efficiency)
        if (folderType && folderType !== 'all') {
            folderQuery = folderQuery.eq('folder_type', folderType);

            // Map folderType to user_item type
            if (folderType === 'exam') {
                itemQuery = itemQuery.eq('type', 'saved_exam');
            } else if (folderType === 'db') {
                itemQuery = itemQuery.eq('type', 'personal_db');
            }
        }

        // 3. Mode 'all' (Tree structure) - Only returns folders
        if (mode === 'all') {
            const { data: folders, error } = await folderQuery.order('name');
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ folders });
        }

        // 4. Content Fetch for current context (Folders + Items)
        if (parentId === 'root' || !parentId) {
            folderQuery = folderQuery.is('parent_id', null);
            itemQuery = itemQuery.is('folder_id', null);
        } else {
            folderQuery = folderQuery.eq('parent_id', parentId);
            itemQuery = itemQuery.eq('folder_id', parentId);
        }

        // Execute in parallel for speed
        const [foldersRes, itemsRes] = await Promise.all([
            folderQuery.order('name'),
            itemQuery.order('created_at', { ascending: false })
        ]);

        if (foldersRes.error) return NextResponse.json({ error: `Folder Query Error: ${foldersRes.error.message}` }, { status: 500 });
        if (itemsRes.error) return NextResponse.json({ error: `Item Query Error: ${itemsRes.error.message}` }, { status: 500 });

        return NextResponse.json({
            folders: foldersRes.data || [],
            items: itemsRes.data || []
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
