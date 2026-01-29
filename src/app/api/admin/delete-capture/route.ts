import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/utils/admin-auth';

export async function POST(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    try {
        const { imageId, imageUrl } = await req.json();

        if (!imageId || !imageUrl) {
            return NextResponse.json({ error: '삭제 요청 데이터가 부족합니다.' }, { status: 400 });
        }

        const supabase = await createClient();

        // 1. Storage에서 파일 삭제
        // URL 형태: https://.../storage/v1/object/public/hwpx/manual_captures/file_name.png
        // 'hwpx' 버킷 이후의 경로가 필요함
        const bucketMatch = imageUrl.match(/\/hwpx\/(.*)/);
        if (bucketMatch && bucketMatch[1]) {
            const storagePath = decodeURIComponent(bucketMatch[1]);
            const { error: storageError } = await supabase.storage
                .from('hwpx')
                .remove([storagePath]);

            if (storageError) {
                console.warn("[DELETE_CAPTURE_STORAGE_WARNING]", storageError);
                // 스토리지에 파일이 없을 수도 있으므로 계속 진행 (DB는 지워야 함)
            }
        }

        // 2. DB에서 레코드 삭제
        const { error: dbError } = await supabase
            .from('question_images')
            .delete()
            .eq('id', imageId);

        if (dbError) throw dbError;

        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error("[DELETE_CAPTURE_ERROR]", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
