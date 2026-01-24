import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const questionId = formData.get('questionId') as string;
        const captureType = formData.get('captureType') as string || 'question'; // 'question' or 'solution'

        if (!file || !questionId) {
            return NextResponse.json({ error: '필수 데이터가 누락되었습니다.' }, { status: 400 });
        }

        const supabase = await createClient();

        // 1. Storage 업로드 (기본 버킷 'hwpx' 사용)
        const timestamp = Date.now();
        const filename = `manual_captures/${questionId}_${captureType}_${timestamp}.png`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('hwpx')
            .upload(filename, file, {
                contentType: 'image/png',
                upsert: true
            });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('hwpx')
            .getPublicUrl(filename);

        // 2. question_images 테이블에 레코드 추가
        // 타입에 따라 ID 접두사 구분 (Q: 문제, S: 해설)
        const prefix = captureType === 'solution' ? 'MANUAL_S_' : 'MANUAL_Q_';
        const { error: dbError } = await supabase
            .from('question_images')
            .insert({
                question_id: questionId,
                original_bin_id: `${prefix}${timestamp}`,
                format: 'png',
                data: publicUrl,
                size_bytes: file.size
            });

        if (dbError) throw dbError;

        return NextResponse.json({ success: true, url: publicUrl });

    } catch (e: any) {
        console.error("[UPLOAD_CAPTURE_ERROR]", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
