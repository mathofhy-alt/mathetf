import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/utils/admin-auth';

/**
 * GET /api/admin/questions/images/[id]
 * 
 * Serves raw image data (Base64 or Binary) for a specific question image ID.
 * This allows lazy loading of images in the admin list.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    const { id } = params;
    if (!id) {
        return NextResponse.json({ success: false, error: 'Missing image ID' }, { status: 400 });
    }

    const supabase = createClient();

    try {
        const { data, error } = await supabase
            .from('question_images')
            .select('data, format')
            .eq('id', id)
            .single();

        if (error || !data) {
            return NextResponse.json({ success: false, error: 'Image not found' }, { status: 404 });
        }

        // Return the raw Base64 data as a JSON response
        // In the future, this could be converted to a real image stream (Buffer -> Response with Content-Type)
        return NextResponse.json({
            success: true,
            data: data.data,
            format: data.format
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
