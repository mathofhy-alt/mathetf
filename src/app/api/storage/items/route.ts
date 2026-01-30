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

    const { error } = await supabase
        .from('user_items')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
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
