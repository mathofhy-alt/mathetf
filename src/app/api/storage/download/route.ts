import {recordDownload} from '@/lib/analytics/server';
import {stampMemberId} from '@/lib/hml-v2/member-stamp';
import {examFilename} from '@/lib/hml-v2/validate';
import { savedExamVerified } from '@/lib/savedExamAccess';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import JSZip from 'jszip';

type Loaded = { ok: true; filename: string; buffer: Buffer; sessionId?: string } | { ok: false; status: number; message: string };

/** 보관함 시험지 한 장을 본인 확인·저장 증거 확인 뒤 읽는다(단일·묶음 받기 공용). */
async function loadExam(supabase: ReturnType<typeof createClient>, user: { id: string; email?: string }, id: string): Promise<Loaded> {
    const { data: item, error } = await supabase
        .from('user_items')
        .select('reference_id, name, type, details')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();
    if (error || !item) return { ok: false, status: 404, message: 'Item not found' };
    if (item.type !== 'saved_exam') return { ok: false, status: 400, message: 'Not a downloadable file' };
    if (!await savedExamVerified(user.id, id, item.reference_id, item.details?.hml_path))
        return { ok: false, status: 403, message: '저장이 완료된 시험지만 받을 수 있습니다. 시험지 만들기에서 다시 저장해 주세요.' };

    const lockedPath: string | undefined = item.details?.hml_path;   // 이전 PDF 전용 정책의 시험지도 본인 확인 뒤 서버 권한으로 읽는다
    if (lockedPath && lockedPath !== `locked/${user.id}/${item.reference_id}.hml`)
        return { ok: false, status: 403, message: 'Invalid file path' };
    const filePath = lockedPath || `${user.id}/${item.reference_id}.hml`;
    const { data, error: downloadError } = await (lockedPath ? createAdminClient() : supabase).storage.from('exams').download(filePath);
    if (downloadError) throw new Error(downloadError.message);

    const content = await data.text();
    if (!await savedExamVerified(user.id, id, item.reference_id, lockedPath))
        return { ok: false, status: 403, message: '저장 후 변경된 시험지 파일은 받을 수 없습니다. 시험지 만들기에서 다시 저장해 주세요.' };
    return { ok: true, filename: examFilename(item.name), buffer: Buffer.from(stampMemberId(content, user.email), 'utf8'), sessionId: item.details?.analytics_session_id };
}

function attachment(filename: string) {
    return `attachment; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A')}`;
}

export async function GET(req: NextRequest) {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    // [11/14] 여러 장 고르면 ZIP 하나로 — 브라우저가 연속 다운로드를 막아 한 장만 받던 문제(건의 89994210)
    const ids = Array.from(new Set((searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean))).slice(0, 100);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new NextResponse('Unauthorized', { status: 401 });
    if (!id && ids.length === 0) return new NextResponse('Missing ID', { status: 400 });

    try {
        if (ids.length > 0) {
            const zip = new JSZip();
            const used = new Set<string>();
            const failed: string[] = [];
            for (const one of ids) {
                const r = await loadExam(supabase, user, one).catch((e: any) => ({ ok: false as const, status: 500, message: String(e?.message || e) }));
                if (!r.ok) { failed.push(r.message); continue; }
                let name = r.filename, n = 2;
                const dot = name.lastIndexOf('.');
                while (used.has(name)) name = dot > 0 ? `${r.filename.slice(0, dot)} (${n++})${r.filename.slice(dot)}` : `${r.filename} (${n++})`;
                used.add(name);
                zip.file(name, r.buffer);
                if (user.email !== 'mathofhy@naver.com') await recordDownload(req, user.id, one, r.sessionId);
            }
            if (used.size === 0) return new NextResponse(failed[0] || '받을 수 있는 시험지가 없습니다.', { status: 403 });
            if (failed.length) zip.file('받지 못한 시험지.txt', `${failed.length}개는 받지 못했습니다.\r\n` + failed.map(m => `- ${m}`).join('\r\n'));
            const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
            const d = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
            return new NextResponse(new Uint8Array(buffer), {
                status: 200,
                headers: {
                    'Content-Type': 'application/zip',
                    'Content-Length': String(buffer.byteLength),
                    'Cache-Control': 'private, no-store',
                    'X-Content-Type-Options': 'nosniff',
                    'Content-Disposition': attachment(`수학ETF 시험지 ${used.size}개 ${d}.zip`),
                },
            });
        }

        const r = await loadExam(supabase, user, id!);
        if (!r.ok) return new NextResponse(r.message, { status: r.status });
        if (searchParams.get('probe')) return NextResponse.json({ pdfOnly: false });
        if (user.email !== 'mathofhy@naver.com') await recordDownload(req, user.id, id!, r.sessionId);
        return new NextResponse(new Uint8Array(r.buffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
                'Content-Length': String(r.buffer.byteLength),
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff',
                'Content-Disposition': attachment(r.filename),
            }
        });
    } catch (e: any) {
        console.error(e);
        return new NextResponse('Download Failed: ' + e.message, { status: 500 });
    }
}
