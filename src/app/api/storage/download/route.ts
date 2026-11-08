import {recordDownload} from '@/lib/analytics/server';
import {stampMemberId} from '@/lib/hml-v2/member-stamp';
import {examFilename} from '@/lib/hml-v2/validate';
import { savedExamVerified } from '@/lib/savedExamAccess';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

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
            .select('reference_id, name, type, details')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (error || !item) return new NextResponse('Item not found', { status: 404 });

        if (item.type !== 'saved_exam') {
            return new NextResponse('Not a downloadable file', { status: 400 });
        }
        if (!await savedExamVerified(user.id, id, item.reference_id, item.details?.hml_path))
            return new NextResponse('저장이 완료된 시험지만 받을 수 있습니다. 시험지 만들기에서 다시 저장해 주세요.', { status: 403 });

        if (searchParams.get('probe')) return NextResponse.json({ pdfOnly: false, name: item.name });

        // Reconstruct path: user_id/uuid.hml
        // We assume reference_id is the UUID of the file
        const lockedPath: string | undefined = item.details?.hml_path;   // 이전 PDF 전용 정책의 시험지도 본인 확인 뒤 서버 권한으로 읽는다
        if (lockedPath && lockedPath !== `locked/${user.id}/${item.reference_id}.hml`)
            return new NextResponse('Invalid file path', { status: 403 });
        const filePath = lockedPath || `${user.id}/${item.reference_id}.hml`;

        // Download from Storage
        const { data, error: downloadError } = await (lockedPath ? createAdminClient() : supabase)
            .storage
            .from('exams')
            .download(filePath);

        if (downloadError) throw new Error(downloadError.message);

        // Prepare response
        const content = await data.text();
        if (!await savedExamVerified(user.id, id, item.reference_id, lockedPath))
            return new NextResponse('저장 후 변경된 시험지 파일은 받을 수 없습니다. 시험지 만들기에서 다시 저장해 주세요.', { status: 403 });
        const buffer = Buffer.from(stampMemberId(content, user.email), 'utf8');
        // RFC 5987 encoded filename
        const filename = examFilename(item.name);
        if(user.email!=='mathofhy@naver.com')await recordDownload(req,user.id,id,item.details?.analytics_session_id);
        const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A');

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
                'Content-Length': String(buffer.byteLength),
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff',
                'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
            }
        });

    } catch (e: any) {
        console.error(e);
        return new NextResponse('Download Failed: ' + e.message, { status: 500 });
    }
}
