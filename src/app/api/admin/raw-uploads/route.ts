import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { CURRICULA } from '@/lib/curriculum';

export const dynamic = 'force-dynamic';

/**
 * 원본 제보 삭제 (관리자). [10/6]
 * 예전엔 관리자 화면이 브라우저에서 저장소·exam_materials 를 직접 지웠는데, 권한 규칙(RLS)에 막혀
 * 아무것도 안 지워지면서 오류는 확인하지 않아 '삭제됐다'고 떴다(새로고침하면 다시 나타남, 포천고 제보).
 * 서버에서 관리자 확인 후 지우고, 원본 제보 행만 지울 수 있게 한다.
 */
export async function DELETE(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    const { id } = await req.json().catch(() => ({}));
    if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'id가 없습니다.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: row, error } = await admin.from('exam_materials')
        .select('id, content_type, file_path, description').eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: '제보를 불러오지 못했습니다.' }, { status: 500 });
    if (!row || row.content_type !== '원본제보') return NextResponse.json({ error: '원본 제보만 여기서 지울 수 있습니다.' }, { status: 404 });

    let files: string[] = [];
    try { const d = JSON.parse(row.description || '{}'); if (Array.isArray(d.files)) files = d.files.filter((f: unknown) => typeof f === 'string'); } catch { /* 옛 제보는 description 이 JSON 이 아니다 */ }
    if (!files.length && row.file_path) files = [row.file_path];
    // [10/13] 여러 회차 묶음과 거기서 나뉜 회차는 파일을 같이 쓴다 — 행만 지우고 파일은 남긴다
    try { const d = JSON.parse(row.description || '{}'); if (d.from_bulk || d.split) files = []; } catch { }

    if (files.length) {
        const { error: storageError } = await admin.storage.from('exam-materials').remove(files);
        if (storageError) return NextResponse.json({ error: `파일을 지우지 못했습니다: ${storageError.message}` }, { status: 500 });
    }
    const { error: deleteError } = await admin.from('exam_materials').delete().eq('id', id);
    if (deleteError) return NextResponse.json({ error: `제보 기록을 지우지 못했습니다: ${deleteError.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, files: files.length });
}

/**
 * 원본 제보 운영자 안내 (관리자, 10/7) — 회원 마이페이지 › 내 요청 › 원본 제보에 보인다.
 * 표를 늘리지 않으려고 제보 행 description(JSON: files·note·neis)에 admin_reply·replied_at 을 덧붙인다.
 */
export async function PATCH(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    const { id, admin_reply, reject, split } = await req.json().catch(() => ({}));
    if (typeof id !== 'string') return NextResponse.json({ error: 'id가 없습니다.' }, { status: 400 });
    const admin = createAdminClient();
    const { data: row } = await admin.from('exam_materials').select('*').eq('id', id).maybeSingle();
    if (!row || row.content_type !== '원본제보') return NextResponse.json({ error: '원본 제보를 찾지 못했습니다.' }, { status: 404 });
    let desc: Record<string, unknown> = {};
    try { desc = JSON.parse(row.description || '{}') || {}; } catch { desc = {}; }

    // [10/13] 여러 회차 묶음 → 회차마다 제보 1건(행 1개). 채택·보상·한글 파일은 나뉜 회차 단위로 기존 흐름 그대로.
    //   split: [{ year, grade, semester, examType, subject, from?, to? }] — from·to 는 묶음 파일 번호(1부터), 없으면 묶음 파일 전부
    if (Array.isArray(split)) {
        if (!desc.bulk) return NextResponse.json({ error: '여러 회차 묶음만 나눌 수 있습니다.' }, { status: 400 });
        if (desc.split) return NextResponse.json({ error: '이미 나눈 묶음입니다.' }, { status: 409 });
        const all: string[] = Array.isArray(desc.files) ? (desc.files as unknown[]).filter((f): f is string => typeof f === 'string') : [];
        const subjects = new Set(CURRICULA.flatMap(c => c.subjects));
        const rows = [];
        for (const [i, s] of split.entries()) {
            const year = Number(s?.year), grade = Number(s?.grade), semester = Number(s?.semester), examType = String(s?.examType || ''), subject = String(s?.subject || '');
            if (!(year >= 2000 && year <= 2100) || ![1, 2, 3].includes(grade) || ![1, 2].includes(semester) || !['중간고사', '기말고사'].includes(examType) || !subjects.has(subject))
                return NextResponse.json({ error: `${i + 1}번째 줄을 확인해 주세요 (연도 학년 학기 중간|기말 과목 [파일번호-파일번호])` }, { status: 400 });
            const from = s?.from ? Number(s.from) : 1, to = s?.to ? Number(s.to) : all.length;
            if (!(from >= 1 && to >= from && to <= all.length)) return NextResponse.json({ error: `${i + 1}번째 줄 파일 번호가 묶음(1~${all.length})을 벗어납니다.` }, { status: 400 });
            const files = all.slice(from - 1, to);
            rows.push({
                uploader_id: row.uploader_id, uploader_name: row.uploader_name, school: row.school, region: row.region, district: row.district,
                exam_year: year, grade, semester, exam_type: examType, subject,
                title: `${row.school} ${year}년 ${grade}학년 ${semester}학기 ${examType} ${subject} [원본제보 ${files.length}장]`,
                file_type: files[0].endsWith('.pdf') ? 'PDF' : 'IMAGE', content_type: '원본제보', file_path: files[0],
                description: JSON.stringify({ files, note: desc.note || '', neis: desc.neis, from_bulk: id }),
                price: 0, sales_count: 0, created_at: row.created_at,
            });
        }
        if (!rows.length) return NextResponse.json({ error: '나눌 회차를 한 줄 이상 적어 주세요.' }, { status: 400 });
        const { data: made, error: insErr } = await admin.from('exam_materials').insert(rows).select('*');
        if (insErr) return NextResponse.json({ error: `회차를 만들지 못했습니다: ${insErr.message}` }, { status: 500 });
        desc.split = (made || []).map(r => r.id);
        desc.split_at = new Date().toISOString();
        const { error } = await admin.from('exam_materials').update({ description: JSON.stringify(desc) }).eq('id', id);
        if (error) return NextResponse.json({ error: '묶음 표시를 저장하지 못했습니다(회차는 만들어졌습니다).' }, { status: 500 });
        return NextResponse.json({ ok: true, made, description: JSON.stringify(desc) });
    }
    const text = String(admin_reply ?? '').trim().slice(0, 2000);
    desc.admin_reply = text || null;
    desc.replied_at = text ? new Date().toISOString() : null;
    // [10/8] 반려 — 사유(안내)는 남기고, 올린 파일은 지우고, 같은 시험을 다시 신청할 수 있게 연다(examsOf 가 rejected 를 건너뜀)
    if (reject === true) {
        if (!text) return NextResponse.json({ error: '반려 사유를 회원 안내 칸에 적어 주세요.' }, { status: 400 });
        let files: string[] = Array.isArray(desc.files) ? (desc.files as unknown[]).filter((f): f is string => typeof f === 'string') : [];
        if (!files.length && row.file_path && !desc.rejected) files = [row.file_path];   // 옛 제보는 파일 경로가 file_path 에만 있다(10/8 백마고 — 반려했는데 파일이 남음)
        if (desc.from_bulk || desc.split) files = [];   // [10/13] 묶음 파일은 나뉜 회차들이 같이 쓴다 — 하나를 반려해도 지우지 않는다
        if (files.length) {
            const { error: rmErr } = await admin.storage.from('exam-materials').remove(files);
            if (rmErr) return NextResponse.json({ error: `파일을 지우지 못했습니다: ${rmErr.message}` }, { status: 500 });
        }
        desc.rejected = true;
        desc.rejected_at = new Date().toISOString();
        desc.removed_files = files.length;
        desc.files = [];
    }
    const { error } = await admin.from('exam_materials').update({ description: JSON.stringify(desc) }).eq('id', id);
    if (error) return NextResponse.json({ error: '저장하지 못했습니다.' }, { status: 500 });
    return NextResponse.json({ ok: true, admin_reply: desc.admin_reply, replied_at: desc.replied_at, rejected: desc.rejected === true, description: JSON.stringify(desc) });
}
