import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode'); // 'all' for tree
    const parentId = searchParams.get('parentId'); // 'root' or UUID

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let folderQuery = supabase
        .from('folders')
        .select('*')
        .eq('user_id', user.id);

    // If mode is 'all', we return ALL folders (for the tree structure)
    // We do NOT query items in this case usually, or separate query.
    if (mode === 'all') {
        const { data: folders, error } = await folderQuery;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ folders });
    }

    let itemQuery = supabase
        .from('user_items')
        .select('*')
        .eq('user_id', user.id);

    if (parentId === 'root' || !parentId) {
        folderQuery = folderQuery.is('parent_id', null);
        itemQuery = itemQuery.is('folder_id', null); // Or specific logic for root items
        // For MVP, allow null folder_id implies root
    } else {
        folderQuery = folderQuery.eq('parent_id', parentId);
        itemQuery = itemQuery.eq('folder_id', parentId);
    }

    const [folders, items] = await Promise.all([folderQuery, itemQuery]);

    if (folders.error) return NextResponse.json({ error: folders.error.message }, { status: 500 });
    // Items error might occur if parentId is root and we didn't query items.

    // For root, we only return folders? Or maybe we allow items in root? 
    // Schema: folder_id UUID NOT NULL. So items MUST be in a folder.
    // So for Root (parentId=null), we return subfolders. Items are empty.

    return NextResponse.json({
        folders: folders.data || [],
        items: parentId && parentId !== 'root' ? (items.data || []) : []
    });
}

export async function POST(req: NextRequest) {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { name, parentId } = body;

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const { data, error } = await supabase
        .from('folders')
        .insert({
            user_id: user.id,
            name,
            parent_id: parentId === 'root' ? null : parentId
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
