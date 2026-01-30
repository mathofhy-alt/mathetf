import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    const supabase = createClient();
    const { id } = params;
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { name, parentId } = body; // Rename or Move

    const updates: any = {};
    if (name) updates.name = name;
    if (parentId !== undefined) updates.parent_id = parentId === 'root' ? null : parentId;

    const { data, error } = await supabase
        .from('folders')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id) // Security check
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const supabase = createClient();
    const { id } = params;
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Cascade delete is handled by DB constraints, but RLS must allow it.
    // Ensure user owns the folder.
    const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
