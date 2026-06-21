import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { readCrop } from '@/lib/print-vision';
import { generateEmbedding } from '@/lib/embeddings';
import { unitVariants, SUBJECT_UNITS } from '@/lib/curriculum';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALL_VARIANTS = Array.from(new Set(Object.values(SUBJECT_UNITS).flat().flatMap((u) => unitVariants(u))));

/**
 * POST /api/print/match  { image: base64(데이터 접두사 제거), mimeType }
 * 크롭 문제 이미지 → Gemini 읽기 → OpenAI 임베딩 → match_predict 로 유사문제 후보 반환.
 * 가입회원 전용.
 */
export async function POST(req: NextRequest) {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

    try {
        const body = await req.json().catch(() => ({}));
        let image: string = body?.image || '';
        const mimeType: string = body?.mimeType || 'image/png';
        const want = Math.min(Math.max(Number(body?.count) || 8, 1), 12);
        if (!image) return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
        // data URL 접두사 제거
        const comma = image.indexOf(',');
        if (image.startsWith('data:') && comma >= 0) image = image.slice(comma + 1);

        // 1) Gemini 로 크롭 읽기
        const reading = await readCrop(image, mimeType);
        if (!reading.text) return NextResponse.json({ error: '문제를 읽지 못했어요. 영역을 더 정확히 잘라보세요.' }, { status: 422 });

        // 2) OpenAI 임베딩 (DB 호환)
        const { embedding } = await generateEmbedding(reading.text);
        const vecLit = '[' + embedding.join(',') + ']';

        // 3) match_predict 로 유사문제 검색 (단원 변형 포함, 단원 불명이면 전체)
        const units = reading.unit ? unitVariants(reading.unit) : ALL_VARIANTS;
        const admin = createAdminClient();
        const { data, error } = await admin.rpc('match_predict', {
            query_embedding: vecLit,
            target_units: units,
            min_diff: 1,
            max_diff: 10,
            exclude_school: null,
            match_count: want * 3,
        });
        if (error) throw error;

        // 출처 편중 방지 → want 개
        const perSource: Record<string, number> = {};
        const picked: any[] = [];
        for (const q of (data || [])) {
            const s = q.source_db_id || '?';
            if ((perSource[s] || 0) >= 2) continue;
            picked.push(q); perSource[s] = (perSource[s] || 0) + 1;
            if (picked.length >= want) break;
        }

        return NextResponse.json({
            reading: { unit: reading.unit, concepts: reading.concepts },
            candidates: picked,
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || '매칭 실패' }, { status: 500 });
    }
}
