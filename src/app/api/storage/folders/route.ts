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
        itemQuery = itemQuery.is('folder_id', null);
    } else {
        folderQuery = folderQuery.eq('parent_id', parentId);
        itemQuery = itemQuery.eq('folder_id', parentId);
    }

    const [folders, items] = await Promise.all([folderQuery, itemQuery]);

    if (folders.error) return NextResponse.json({ error: folders.error.message }, { status: 500 });

    const rawItems = parentId && parentId !== 'root' ? (items.data || []) : [];

    // [Metadata Strategy V3: Storage Sidecar Fetch]
    // Since we lack a metadata table, we fetch the per-file JSON sidecar from Storage.
    // Buckets: 'exams' -> Path: `${user.id}/${reference_id}.json`

    // 1. Identify exams needing metadata
    const examItems = rawItems.filter(i => i.type === 'saved_exam');
    const examMap = new Map();

    if (examItems.length > 0) {
        // console.log(`[StorageAPI] Fetching metadata for ${examItems.length} exams via Storage...`);

        // Parallel Fetch with Promise.allSettled to avoid total failure
        await Promise.allSettled(examItems.map(async (item) => {
            try {
                const metaPath = `${user.id}/${item.reference_id}.json`;
                // Download from 'exams' bucket
                const { data, error } = await supabase.storage
                    .from('exams')
                    .download(metaPath);

                if (error) {
                    // console.warn(`[StorageAPI] Meta fetch failed for ${item.id}:`, error.message);
                    return;
                }

                if (data) {
                    const text = await data.text();
                    const json = JSON.parse(text);
                    examMap.set(item.reference_id, json);
                }
            } catch (e) {
                // console.warn(`[StorageAPI] Meta parse error for ${item.id}`, e);
            }
        }));
        // console.log(`[StorageAPI] Fetched metadata for ${examMap.size} items.`);
    }

    // Merge metadata
    const enrichedItems = rawItems.map(item => {
        let details = null;
        if (item.type === 'saved_exam') {
            const meta = examMap.get(item.reference_id);
            if (meta) {
                details = {
                    question_count: meta.question_count,
                    average_difficulty: meta.average_difficulty
                };
            }
        }
        return { ...item, details };
    });

    return NextResponse.json({
        folders: folders.data || [],
        items: enrichedItems
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
