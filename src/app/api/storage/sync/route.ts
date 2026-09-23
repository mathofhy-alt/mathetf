import {availableCatalog,readAllPages} from '@/lib/questions/catalog';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { PERSONAL_DB_FREE_MODE } from '@/lib/config';

export async function POST(req: NextRequest) {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let dbPurchases:any[];
    try { dbPurchases=(await availableCatalog()).filter(db=>db.exam_type!=='모의고사' && !db.availability).map(db=>({exam_materials:db})); }
    catch { return NextResponse.json({error:'자료 목록을 불러오지 못했습니다.'},{status:503}); }

    if (dbPurchases.length === 0) return NextResponse.json({ count: 0 });

    // 2. Find or Create "Purchased DBs" folder
    // 2026-08-27 '구매한 학교 기출' → '내신기출' (사용자 요청). 기존 행은 마이그레이션으로 함께 변경했다.
    const FOLDER_NAME = '내신기출';

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
    const existingItems = await readAllPages<any>((from,to)=>supabase.from('user_items').select('id,reference_id').eq('user_id',user.id).eq('type','personal_db').order('id').range(from,to));

    const existingRefIds = new Set(existingItems?.map(i => i.reference_id) || []);

    // 4. Filter missing items (to add)
    const validRefIds = new Set(dbPurchases.map(p => p.exam_materials.id));

    const newItems = dbPurchases
        .filter(p => !existingRefIds.has(p.exam_materials.id))
        .map(p => ({
            user_id: user.id,
            folder_id: targetFolder.id,
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

    return NextResponse.json({ count: newItems.length, removed: 0 });

}
