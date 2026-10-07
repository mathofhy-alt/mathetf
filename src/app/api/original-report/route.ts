import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import neis from '@/lib/neis-high-schools.json';
import { REPORT_MIN_YEAR } from '@/lib/report-reward';

export const dynamic = 'force-dynamic';

/**
 * 회원 원본 시험지 제보 (2026-10-05).
 *
 * 예전 자료등록 창은 브라우저가 exam_materials 에 직접 행을 넣었다. 회원에게 다시 열면서
 * 판매 자료(해설·가격)를 등록할 길까지 열리지 않도록, 행은 이 서버 라우트만 넣는다:
 * 항상 content_type='원본제보', price=0 (비공개 — 홈·학교·시험지 페이지가 원본제보를 제외한다).
 *
 * 사진은 여러 장(휴대폰 촬영)이라 서버를 거치지 않고 서명된 업로드 주소로 저장소에 바로 올린다
 * (Vercel 요청 본문 4.5MB 제한). 여러 장도 제보 1건 = 행 1개 — 채택 보상(approve-submission)이
 * 행 단위라 장수만큼 중복 지급되지 않게 한다. 나머지 파일 경로는 description(JSON)에 둔다.
 *
 * POST { action: 'sign', files: [{ name, type, size }] } → { uploads: [{ path, token }] }
 * POST { action: 'submit', meta, paths }                  → { ok: true, id }
 * GET                                                     → { schools: [{ name, region, district, code }] } (전국 고등학교 — 이 목록에서만 고른다)
 *
 * [10/5 사용자 결정] 학교는 직접 입력 대신 NEIS 전국 고등학교 명단(2,408곳, lib/neis-high-schools.json)에서만 고른다
 *   — 오타 방지 + 우리에게 없는 학교도 제보받기 위해. 이미 가진 학교도 새 회차가 필요하니 빼지 않는다. 하루 한도 없음.
 *   이름 같은 학교가 101곳이라 학교 코드(code)로 고른다.
 */

const BUCKET = 'exam-materials';
const MAX_FILES = 30;
const MAX_BYTES = 20 * 1024 * 1024;
const OK_TYPES: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf',
};
type NeisSchool = { name: string; region: string; district: string; code: string; kind: string };
const SCHOOLS: NeisSchool[] = (neis as { schools: NeisSchool[] }).schools;
const BY_CODE = new Map(SCHOOLS.map(s => [s.code, s]));

async function currentUser() {
    const { data, error } = await createClient().auth.getUser();
    return error ? null : data.user;
}

/** 이 학교에 이미 있는 회차(정식 자료) / 이미 접수된 제보 — '연도-학년-학기-시험-과목' 키 */
async function examsOf(picked: NeisSchool) {
    const stem = picked.district.replace(/(특별자치시|시|군|구)$/, '');
    const full = Array.from(new Set([picked.name, picked.region + picked.name, stem + picked.name]));
    const twin = SCHOOLS.filter(x => x.name === picked.name).length > 1;   // 동명이교면 지역도 같아야 같은 학교
    const { data } = await createAdminClient().from('exam_materials').select('exam_year, grade, semester, exam_type, subject, content_type, region').in('school', full);
    const owned = new Set<string>(), pending = new Set<string>();
    for (const r of data || []) {
        if (twin && r.region && r.region !== picked.region) continue;
        const key = `${r.exam_year}-${r.grade}-${r.semester}-${r.exam_type}-${r.subject}`;
        (r.content_type === '원본제보' ? pending : owned).add(key);
    }
    return { owned, pending };
}

export async function GET(req: NextRequest) {
    // [10/7] 마이페이지 › 내 요청 — 내가 올린 원본 제보와 운영자 안내·채택 여부(본인 것만)
    if (req.nextUrl.searchParams.get('mine')) {
        const { data: { user } } = await createClient().auth.getUser();
        if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
        const admin = createAdminClient();
        const { data, error } = await admin.from('exam_materials')
            .select('id, school, exam_year, grade, semester, exam_type, subject, description, created_at')
            .eq('content_type', '원본제보').eq('uploader_id', user.id).order('created_at', { ascending: false }).limit(100);
        if (error) return NextResponse.json({ error: '제보 내역을 불러오지 못했습니다.' }, { status: 500 });
        const ids = (data || []).map(r => r.id);
        const { data: rewards } = ids.length ? await admin.from('point_transactions').select('related_id, amount').eq('user_id', user.id).eq('type', 'submission_reward').in('related_id', ids) : { data: [] as any[] };
        const reward = new Map((rewards || []).map(r => [r.related_id, r.amount]));
        const reports = (data || []).map(r => {
            let d: any = {};
            try { d = JSON.parse(r.description || '{}') || {}; } catch { }
            return {
                id: r.id, created_at: r.created_at,
                title: `${r.school} ${r.exam_year}년 ${r.grade}학년 ${r.semester}학기 ${r.exam_type} ${r.subject}`,
                count: Array.isArray(d.files) ? d.files.length : 1, note: d.note || null,
                admin_reply: d.admin_reply || null, replied_at: d.replied_at || null,
                reward: reward.get(r.id) ?? null,
            };
        });
        return NextResponse.json({ reports }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const code = req.nextUrl.searchParams.get('code');
    if (code) {   // 학교를 고르면: 이미 있는/접수된 회차를 먼저 알려 줘 고를 수 없게 한다
        const picked = BY_CODE.get(code);
        if (!picked) return NextResponse.json({ owned: [], pending: [] });
        const { owned, pending } = await examsOf(picked);
        return NextResponse.json({ owned: Array.from(owned), pending: Array.from(pending) }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const schools = SCHOOLS.map(({ name, region, district, code }) => ({ name, region, district, code }));
    return NextResponse.json({ schools }, { headers: { 'Cache-Control': 'public, max-age=86400' } });
}

export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: '로그인 후 제보할 수 있습니다.' }, { status: 401 });
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: '요청을 읽지 못했습니다.' }, { status: 400 });
    const admin = createAdminClient();

    if (body.action === 'sign') {
        const files = Array.isArray(body.files) ? body.files : [];
        if (files.length < 1 || files.length > MAX_FILES) return NextResponse.json({ error: `사진은 1~${MAX_FILES}장까지 올릴 수 있어요.` }, { status: 400 });
        for (const f of files) {
            if (!OK_TYPES[f?.type]) return NextResponse.json({ error: `${f?.name || '파일'}: 사진(JPG·PNG·HEIC) 또는 PDF만 올릴 수 있어요.` }, { status: 400 });
            if (!(f.size > 0) || f.size > MAX_BYTES) return NextResponse.json({ error: `${f?.name || '파일'}: 한 장에 20MB까지 올릴 수 있어요.` }, { status: 400 });
        }
        const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const uploads = [];
        for (let i = 0; i < files.length; i++) {
            const path = `${user.id}/report_${stamp}_${String(i + 1).padStart(2, '0')}.${OK_TYPES[files[i].type]}`;
            const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
            if (error || !data) return NextResponse.json({ error: '업로드 준비에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
            uploads.push({ path: data.path, token: data.token });
        }
        return NextResponse.json({ uploads });
    }

    if (body.action === 'submit') {
        const m = body.meta || {};
        const picked = BY_CODE.get(String(m.code || ''));
        if (!picked) return NextResponse.json({ error: '학교는 목록에서 골라주세요.' }, { status: 400 });
        const school = picked.name, region = picked.region;
        const year = Number(m.year), grade = Number(m.grade), semester = Number(m.semester);
        const examType = ['중간고사', '기말고사'].includes(m.examType) ? m.examType : '';
        const subject = String(m.subject || '').trim().slice(0, 20);
        const note = String(m.note || '').trim().slice(0, 300);
        const paths: string[] = Array.isArray(body.paths) ? body.paths.filter((p: unknown) => typeof p === 'string') : [];
        if (!(year >= REPORT_MIN_YEAR && year <= new Date().getFullYear() + 1) || ![1, 2, 3].includes(grade) || ![1, 2].includes(semester) || !examType || !subject)
            return NextResponse.json({ error: '시험 정보(연도·학년·학기·시험·과목)를 확인해주세요.' }, { status: 400 });
        if (paths.length < 1 || paths.length > MAX_FILES || paths.some(p => !p.startsWith(`${user.id}/report_`)))
            return NextResponse.json({ error: '올린 사진 정보를 확인할 수 없습니다. 다시 시도해주세요.' }, { status: 400 });

        // 올렸다고 한 파일이 실제로 저장소에 있는지
        const { data: listed } = await admin.storage.from(BUCKET).list(user.id, { limit: 1000, search: 'report_' });
        const have = new Set((listed || []).map(o => `${user.id}/${o.name}`));
        if (paths.some(p => !have.has(p))) return NextResponse.json({ error: '사진 업로드가 끝나지 않았어요. 다시 시도해주세요.' }, { status: 400 });

        // 중복: 이미 보유한 시험(정식 자료) / 이미 접수된 같은 시험 제보 — 화면에서도 미리 막지만 서버에서 다시 확인
        const { owned, pending } = await examsOf(picked);
        const key = `${year}-${grade}-${semester}-${examType}-${subject}`;
        if (owned.has(key))
            return NextResponse.json({ error: `이미 보유 중인 시험지예요 (${school} ${year}년 ${grade}학년 ${semester}학기 ${examType} ${subject}). 홈에서 검색해 이용해주세요!` }, { status: 409 });
        if (pending.has(key))
            return NextResponse.json({ error: '같은 시험의 제보가 이미 접수되어 검토 중이에요. 조금만 기다려주세요!' }, { status: 409 });

        const first = paths[0];
        const displayName = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Unknown';
        const { data: row, error } = await admin.from('exam_materials').insert({
            uploader_id: user.id,
            uploader_name: displayName,
            school, region, district: picked.district,
            exam_year: year, grade, semester, exam_type: examType, subject,
            title: `${school} ${year}년 ${grade}학년 ${semester}학기 ${examType} ${subject} [원본제보 ${paths.length}장]`,
            file_type: first.endsWith('.pdf') ? 'PDF' : 'IMAGE',
            content_type: '원본제보',
            file_path: first,
            description: JSON.stringify({ files: paths, note, neis: { code: picked.code, region: picked.region, district: picked.district, kind: picked.kind } }),
            price: 0, sales_count: 0,
        }).select('id').single();
        if (error) {
            console.error('[original-report] insert', error);
            return NextResponse.json({ error: '제보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
        }
        return NextResponse.json({ ok: true, id: row.id });
    }

    return NextResponse.json({ error: '알 수 없는 요청입니다.' }, { status: 400 });
}
