
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new NextResponse('Unauthorized', { status: 401 });

    if (!id) return new NextResponse('Missing ID', { status: 400 });

    try {
        // Fetch item to get reference_id (UUID)
        const { data: item, error } = await supabase
            .from('user_items')
            .select('reference_id, name, type')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (error || !item) return new NextResponse('Item not found', { status: 404 });

        if (item.type !== 'saved_exam') {
            return new NextResponse('Not a downloadable file', { status: 400 });
        }

        // Reconstruct path: user_id/uuid.hml
        // We assume reference_id is the UUID of the file
        const filePath = `${user.id}/${item.reference_id}.hml`;

        // Download from Storage
        const { data, error: downloadError } = await supabase
            .storage
            .from('exams')
            .download(filePath);

        if (downloadError) throw new Error(downloadError.message);

        // Prepare response
        const buffer = await data.arrayBuffer();
        // RFC 5987 encoded filename
        const filename = `${item.name}.hml`;
        const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A');

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/x-hwp',
                'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
            }
        });

    } catch (e: any) {
        console.error(e);
        return new NextResponse('Download Failed: ' + e.message, { status: 500 });
    }
}
