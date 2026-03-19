import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Shopping Cart API
 * GET: Fetch user's cart items
 * POST: Add item to cart
 * DELETE: Remove specific item or clear all
 */

export async function GET(req: NextRequest) {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: cartItems, error } = await supabase
        .from('cart_items')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: cartItems });
}

export async function POST(req: NextRequest) {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { item_type, item_id, title, price } = body;

        if (!item_type || !item_id || !title || price === undefined) {
             return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Check if item already exists in cart to prevent duplicates
        const { data: existingItem } = await supabase
            .from('cart_items')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('item_id', item_id)
            .single();

        if (existingItem) {
             return NextResponse.json({ error: 'Item already in cart', code: 'ALREADY_IN_CART' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('cart_items')
            .insert({
                user_id: session.user.id,
                item_type,
                item_id,
                title,
                price
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, item: data });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get('id');
    const clearAll = req.nextUrl.searchParams.get('clear_all') === 'true';

    if (clearAll) {
         // Clear entire cart for user after successful checkout
         const { error } = await supabase
            .from('cart_items')
            .delete()
            .eq('user_id', session.user.id);

         if (error) return NextResponse.json({ error: error.message }, { status: 500 });
         return NextResponse.json({ success: true });
    }

    if (!id) {
        return NextResponse.json({ error: 'Missing item ID' }, { status: 400 });
    }

    // Delete specific item
    const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', id)
        .eq('user_id', session.user.id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
