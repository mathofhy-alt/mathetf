/**
 * AI 데이터 생성 — 로컬 실행판 (시간 제한 없음)
 *
 * 관리자 "AI 데이터 생성" 버튼과 동일한 로직(동일 라이브러리 generateTags/generateEmbedding)을
 * Vercel 함수의 시간 예산 없이 끝까지 돌린다. 단원·태그·난이도가 비었거나 임베딩이 없는
 * 문항만 골라 처리하므로 여러 번 실행해도 안전(멱등).
 *
 * 사용:  npx tsx scripts/generate_ai_data.ts          (남은 것 전부)
 *        npx tsx scripts/generate_ai_data.ts --limit 50
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { generateTags, generateEmbedding } from '../src/lib/embeddings';
import { CONCEPT_MAP } from '../src/lib/concept-map';
import { canonicalUnit, ALL_SUBJECTS } from '../src/lib/curriculum';

// ── route(embeddings/generate)와 동일한 규칙들 ──────────────────────────
const VALID_SUBJECTS = Array.from(new Set([...Object.keys(CONCEPT_MAP), ...ALL_SUBJECTS]));
const SUBJECT_2015_TO_2022: Record<string, string> = {
    '수학(상)': '공통수학1', '수학(하)': '공통수학2', '수학I': '대수', '수학II': '미적분I', '미적분': '미적분II',
};
const GRADE_ALLOWED_SUBJECTS: Record<string, string[]> = {
    '고1': ['공통수학1', '공통수학2'],
    '고2': ['공통수학1', '공통수학2', '대수', '미적분I', '확률과통계'],
};
function subjectFromSourceDbId(sourceDbId: string | null | undefined): string | null {
    if (!sourceDbId) return null;
    const last = sourceDbId.split('_').pop()?.trim() || '';
    return VALID_SUBJECTS.includes(last) ? last : null;
}
function allowedSubjectsForGrade(grade: string | null | undefined): string[] | null {
    const g = String(grade || '').match(/[123]/)?.[0];
    return g ? (GRADE_ALLOWED_SUBJECTS[`고${g}`] || null) : null;
}
// ─────────────────────────────────────────────────────────────────────

const CONCURRENCY = 6; // Gemini 레이트리밋 완화 (서버는 16이지만 로컬은 안전하게)

async function main() {
    const limitArg = process.argv.indexOf('--limit');
    const limit = limitArg > -1 ? parseInt(process.argv[limitArg + 1]) : 10000;

    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 처리 대상: 임베딩 없음 OR 단원 없음/빈문자열 (버튼과 동일 + '' 케이스 보강)
    const pending: any[] = [];
    for (let off = 0; ; off += 1000) {
        const { data, error } = await sb
            .from('questions')
            .select('id, content_xml, plain_text, equation_scripts, subject, grade, school, difficulty, key_concepts, unit, source_db_id')
            .or('embedding.is.null,unit.is.null,unit.eq.""')
            .order('created_at', { ascending: false })
            .range(off, off + 999);
        if (error) throw error;
        if (!data?.length) break;
        pending.push(...data);
        if (data.length < 1000) break;
    }
    const targets = pending.slice(0, limit);
    console.log(`대상: ${targets.length}문항 (전체 미처리 ${pending.length})\n`);
    if (targets.length === 0) { console.log('처리할 문항이 없습니다. ✅'); return; }

    let ok = 0, skip = 0, fail = 0;
    const failed: string[] = [];

    async function processOne(q: any, idx: number) {
        const t0 = Date.now();
        const label = `[${idx + 1}/${targets.length}] ${(q.source_db_id || '?').slice(0, 40)} (${q.id.slice(0, 8)})`;
        try {
            const contentParts = [
                `[과목: ${q.subject || '수학'}]`,
                `[학년: ${q.grade || '공통'}]`,
                q.content_xml ? q.content_xml.replace(/<[^>]+>/g, ' ') : (q.plain_text || ''),
                ...(q.equation_scripts || []),
            ];
            const textToEmbed = contentParts.join(' ').trim();
            if (!textToEmbed) { skip++; console.log(`${label} SKIP(빈 본문)`); return; }

            let updatedConcepts = q.key_concepts;
            let updatedUnit = (q.unit || '').trim() || null;
            const sourceSubject = subjectFromSourceDbId(q.source_db_id);
            let updatedSubject = sourceSubject || q.subject;
            let updatedDifficulty = q.difficulty;
            let tagsForEmbedding = '';

            const needsTags = !updatedConcepts || (Array.isArray(updatedConcepts) && updatedConcepts.length === 0);
            const needsUnit = !updatedUnit;
            const needsSubject = !updatedSubject || updatedSubject === '전과목' || updatedSubject === '수학';
            const needsDifficulty = updatedDifficulty == null || updatedDifficulty === '' || isNaN(Number(updatedDifficulty));

            if (needsTags || needsUnit || needsSubject || needsDifficulty) {
                const { data: imgData } = await sb
                    .from('question_images').select('data').eq('question_id', q.id)
                    .order('created_at', { ascending: true });
                const imageUrls: string[] = (imgData || []).map((r: any) => r.data);

                const aiLockSubject = sourceSubject ? (SUBJECT_2015_TO_2022[sourceSubject] || sourceSubject) : null;
                const gradeAllowed = aiLockSubject ? null : allowedSubjectsForGrade(q.grade);
                const tagData = await generateTags(textToEmbed, aiLockSubject || q.subject || '수학', imageUrls, aiLockSubject, gradeAllowed);

                if (needsTags && tagData.tags.length > 0) {
                    updatedConcepts = tagData.tags.map((t: string) => `#${t}`);
                    tagsForEmbedding = tagData.tags.join(', ');
                } else if (!needsTags && updatedConcepts) {
                    tagsForEmbedding = Array.isArray(updatedConcepts)
                        ? updatedConcepts.map((t: string) => String(t).replace(/^#/, '')).join(', ')
                        : String(updatedConcepts).replace(/^#/, '');
                }
                if (needsUnit && tagData.unit) updatedUnit = canonicalUnit(tagData.unit) || tagData.unit;
                if (needsSubject && !sourceSubject && tagData.subject) updatedSubject = tagData.subject;
                if (needsDifficulty && tagData.difficulty != null) updatedDifficulty = String(tagData.difficulty);
            } else if (updatedConcepts) {
                tagsForEmbedding = Array.isArray(updatedConcepts)
                    ? updatedConcepts.map((t: string) => String(t).replace(/^#/, '')).join(', ')
                    : String(updatedConcepts).replace(/^#/, '');
            }

            const finalText = tagsForEmbedding ? `[핵심개념태그: ${tagsForEmbedding}]\n${textToEmbed}` : textToEmbed;
            const emb = await generateEmbedding(finalText);

            const { error: upErr } = await sb.from('questions').update({
                embedding: emb.embedding,
                ...(updatedConcepts !== q.key_concepts ? { key_concepts: updatedConcepts } : {}),
                ...(updatedUnit !== q.unit ? { unit: updatedUnit } : {}),
                ...(updatedSubject !== q.subject ? { subject: updatedSubject } : {}),
                ...(updatedDifficulty !== q.difficulty ? { difficulty: updatedDifficulty } : {}),
            }).eq('id', q.id);
            if (upErr) throw upErr;

            ok++;
            console.log(`${label} OK unit=${updatedUnit} tags=${Array.isArray(updatedConcepts) ? updatedConcepts.length : 0} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        } catch (e: any) {
            fail++;
            failed.push(q.id.slice(0, 8));
            console.log(`${label} ❌ ${String(e?.message || e).slice(0, 160)}`);
        }
    }

    // 단순 동시성 풀
    let cursor = 0;
    async function worker() {
        while (cursor < targets.length) {
            const i = cursor++;
            await processOne(targets[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker()));

    console.log(`\n완료: 성공 ${ok} / 건너뜀 ${skip} / 실패 ${fail}`);
    if (failed.length) console.log(`실패 id(재실행하면 다시 시도됨): ${failed.join(', ')}`);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
