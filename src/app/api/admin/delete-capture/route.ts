import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/utils/admin-auth';

export async function POST(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    try {
        let { imageId, imageUrl } = await req.json();

        if (!imageId) {
            return NextResponse.json({ error: '삭제 요청 데이터(ID)가 부족합니다.' }, { status: 400 });
        }

        const supabase = await createClient();

        // If imageUrl is missing, fetch it from DB first
        if (!imageUrl) {
            const { data: imgData, error: fetchError } = await supabase
                .from('question_images')
                .select('data')
                .eq('id', imageId)
                .single();

            if (!fetchError && imgData) {
                imageUrl = imgData.data;
            }
        }

        // 1. Storage에서 파일 삭제 (URL이 있는 경우에만)
        if (imageUrl && imageUrl.startsWith('http')) {
            // URL 형태: https://.../storage/v1/object/public/hwpx/manual_captures/file_name.png
            const bucketMatch = imageUrl.match(/\/hwpx\/(.*)/);
            if (bucketMatch && bucketMatch[1]) {
                const storagePath = decodeURIComponent(bucketMatch[1]);
                const { error: storageError } = await supabase.storage
                    .from('hwpx')
                    .remove([storagePath]);

                if (storageError) {
                    console.warn("[DELETE_CAPTURE_STORAGE_WARNING]", storageError);
                }
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
