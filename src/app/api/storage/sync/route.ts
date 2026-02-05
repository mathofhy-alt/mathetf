import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 1. Fetch all purchased DBs
    const { data: purchases, error: purchaseError } = await supabase
        .from('purchases')
        .select(`
            *,
            exam_materials!inner (
                id, title
            )
        `)
        .eq('user_id', user.id)
        .eq('exam_materials.file_type', 'DB');

    if (purchaseError) return NextResponse.json({ error: purchaseError.message }, { status: 500 });
    if (!purchases || purchases.length === 0) return NextResponse.json({ count: 0 });

    // 2. Find or Create "Purchased DBs" folder
    const FOLDER_NAME = '구매한 학교 기출';

    // Fetch ALL matching folders to handle duplicates and update them all
    let { data: folders } = await supabase
        .from('folders')
        .select('id, folder_type')
        .eq('user_id', user.id)
        .eq('name', FOLDER_NAME)
        .is('parent_id', null);

    let targetFolder;

    if (!folders || folders.length === 0) {
        const { data: newFolder, error: createError } = await supabase
            .from('folders')
            .insert({
                user_id: user.id,
                name: FOLDER_NAME,
                parent_id: null,
                folder_type: 'db'
            })
            .select()
            .single();

        if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
        targetFolder = newFolder;
    } else {
        // Fix: Update ALL matching folders to type 'db' to ensure visibility
        const foldersToUpdate = folders.filter(f => f.folder_type !== 'db');
        if (foldersToUpdate.length > 0) {
            const ids = foldersToUpdate.map(f => f.id);
            await supabase
                .from('folders')
                .update({ folder_type: 'db' })
                .in('id', ids);
        }
        targetFolder = folders[0];
    }

    if (!targetFolder) return NextResponse.json({ error: 'Folder creation failed' }, { status: 500 });

    // 3. Fetch existing linked items
    const { data: existingItems } = await supabase
        .from('user_items')
        .select('reference_id')
        .eq('user_id', user.id)
        .eq('type', 'personal_db');

    const existingRefIds = new Set(existingItems?.map(i => i.reference_id) || []);

    // 4. Filter missing items
    const newItems = purchases
        .filter(p => !existingRefIds.has(p.exam_materials.id))
        .map(p => ({
            user_id: user.id,
            folder_id: targetFolder.id, // Sync to specific folder
            type: 'personal_db',
            reference_id: p.exam_materials.id,
            name: p.exam_materials.title
        }));

    if (newItems.length > 0) {
        const { error: insertError } = await supabase
            .from('user_items')
            .insert(newItems);

        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ count: newItems.length });
}
