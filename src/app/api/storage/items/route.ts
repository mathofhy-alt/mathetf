import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { folderId, type, referenceId, name } = body;

    // Validation
    if (!folderId || !type || !referenceId) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('user_items')
        .insert({
            user_id: user.id,
            folder_id: folderId,
            type,
            reference_id: referenceId,
            name // Optional override
        })
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

    try {
        // 1. Get item info first to know the type and reference_id
        const { data: item, error: fetchError } = await supabase
            .from('user_items')
            .select('type, reference_id')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !item) {
            return NextResponse.json({ error: 'Item not found or access denied' }, { status: 404 });
        }

        // 2. If it's a saved_exam, delete files from Storage
        if (item.type === 'saved_exam' && item.reference_id) {
            console.log(`[StorageCleanup] Deleting files for exam: ${item.reference_id}`);
            const hmlPath = `${user.id}/${item.reference_id}.hml`;
            const jsonPath = `${user.id}/${item.reference_id}.json`;

            const { error: storageError } = await supabase.storage
                .from('exams')
                .remove([hmlPath, jsonPath]);

            if (storageError) {
                console.warn('[StorageCleanup] Storage removal warning:', storageError.message);
                // We proceed to delete the DB record anyway to avoid stale entries
            } else {
                console.log('[StorageCleanup] Storage files deleted successfully');
            }
        }

        // 3. Finalize: Delete DB Record
        const { error: dbError } = await supabase
            .from('user_items')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (dbError) throw dbError;

        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error('[StorageCleanup] Fatal Error during deletion:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { id, name, folderId } = body;

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const updateData: any = {};
    if (name) updateData.name = name;
    if (folderId !== undefined) updateData.folder_id = folderId === 'root' ? null : folderId;

    const { data, error } = await supabase
        .from('user_items')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
}
