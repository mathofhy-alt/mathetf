import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CATEGORIES = ['전국연합', '평가원', '수능', '경찰대', '사관학교'];
const BUCKET = 'mock-materials';

const FILE_FIELDS: { field: string; col: string; name: string }[] = [
    { field: 'originalPdf', col: 'original_pdf_path', name: 'original.pdf' },
    { field: 'originalHwp', col: 'original_hwp_path', name: 'original.hwp' },
    { field: 'variantPdf', col: 'variant_pdf_path', name: 'variant.pdf' },
    { field: 'variantHwp', col: 'variant_hwp_path', name: 'variant.hwp' },
];

function slugify(s: string) {
    return s.trim().replace(/[\\/<>:"|?*#%]+/g, '').replace(/\s+/g, '-');
}

async function uploadFiles(admin: any, id: string, fd: FormData) {
    const present = FILE_FIELDS.filter((f) => fd.get(f.field) instanceof File && (fd.get(f.field) as File).size > 0);
    const paths: Record<string, string> = {};
    for (const f of present) {
        const file = fd.get(f.field) as File;
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        const key = `${id}/${f.name.replace(/\.\w+$/, '')}.${ext}`;
        const buf = Buffer.from(await file.arrayBuffer());
        const { error } = await admin.storage.from(BUCKET).upload(key, buf, {
            contentType: file.type || 'application/octet-stream', upsert: true,
        });
        if (error) throw new Error(`파일 업로드 실패(${f.field}): ${error.message}`);
        paths[f.col] = key;
    }
    return paths;
}

export async function POST(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    try {
        const fd = await req.formData();
        const id = (fd.get('id') || '').toString().trim();
        const category = (fd.get('category') || '').toString();
        const year = parseInt((fd.get('year') || '').toString(), 10);
        const grade = (fd.get('grade') || '고3').toString();
        const month = parseInt((fd.get('month') || '0').toString(), 10) || null;
        const subject = (fd.get('subject') || '수학').toString();

        if (!CATEGORIES.includes(category)) return NextResponse.json({ error: '분류가 올바르지 않습니다.' }, { status: 400 });
        if (!year || year < 2000 || year > 2100) return NextResponse.json({ error: '연도가 올바르지 않습니다.' }, { status: 400 });

        const autoTitle = `${year} ${grade} ${month ? month + '월 ' : ''}${category} ${subject}`.replace(/\s+/g, ' ').trim();
        const title = (fd.get('title') || autoTitle).toString().trim() || autoTitle;
        const admin = createAdminClient();

        // ── 수정(update) ──
        if (id) {
            const { data: row } = await admin.from('mock_exams').select('id, original_pdf_path').eq('id', id).maybeSingle();
            if (!row) return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 });
            const paths = await uploadFiles(admin, id, fd);
            const patch: Record<string, any> = { category, exam_year: year, grade, month, subject, title, ...paths };
            // 원본 PDF를 교체했으면 미리보기 재생성 위해 초기화
            if (paths.original_pdf_path) patch.preview_urls = null;
            const { error } = await admin.from('mock_exams').update(patch).eq('id', id);
            if (error) throw new Error('수정 실패: ' + error.message);
            return NextResponse.json({ success: true, id, updated: true });
        }

        // ── 생성(create) ──
        const present = FILE_FIELDS.filter((f) => fd.get(f.field) instanceof File && (fd.get(f.field) as File).size > 0);
        if (present.length === 0) return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });

        const newId = crypto.randomUUID();
        let slug = slugify(`${year}-${month ? month + '월-' : ''}${category}-${grade}-${subject}`);
        const { data: dup } = await admin.from('mock_exams').select('id').eq('slug', slug).maybeSingle();
        if (dup) slug = `${slug}-${newId.slice(0, 4)}`;

        const paths = await uploadFiles(admin, newId, fd);
        const { error: insErr } = await admin.from('mock_exams').insert({
            id: newId, category, exam_year: year, grade, month, subject, title, slug, ...paths,
        });
        if (insErr) throw new Error('DB 저장 실패: ' + insErr.message);
        return NextResponse.json({ success: true, id: newId, slug, title });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
