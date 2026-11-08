const { privateOriginalStorage } = require('./original-storage.cjs');
// [수정 재등록] 문항 id 를 **유지한 채** HML 내용만 갈아끼운다.
//
// 왜: 통째로 지우고 새로 넣으면 id 가 바뀌어 사용자가 만든 시험지에서 그 문항이 사라진다.
//     (중앙대사대부고 2025 2학기중간 공통수학2 → 사용자 5명의 저장 시험지가 이 문항들을 참조 중)
//     문항 수가 같으면 번호를 맞춰 내용만 바꾸는 편이 안전하고, 그 시험지들은 수정본으로 갱신된다.
//
// 하는 일: 새 HML 파싱 → 번호별로 기존 id 에 UPDATE → 이미지 전량 교체 →
//          AI 결과(unit/difficulty/key_concepts/embedding)와 layout_lines 를 비워 재생성 유도.
// 사용: npx tsx scratch_replace_inplace.ts <hml경로> <source_db_id>
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { parseHmlV2 } from '../src/lib/hml-v2/parser';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const [hmlPath, srcDbId] = process.argv.slice(2);
if (!srcDbId) { console.error('인자 부족: <hml경로> <source_db_id>'); process.exit(1); }

async function main() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const originals = await privateOriginalStorage(supabase);

    const { data: existing, error: exErr } = await supabase.from('questions')
        .select('id, question_number').eq('source_db_id', srcDbId).order('question_number', { ascending: true });
    if (exErr) throw new Error('기존 문항 조회 실패: ' + exErr.message);
    if (!existing?.length) throw new Error('기존 문항이 없다 — 이 스크립트는 교체 전용이다');

    const hmlContent = readFileSync(hmlPath, 'utf-8');
    const { questions, images } = parseHmlV2(hmlContent);
    if (!questions.length) throw new Error('파싱 실패: 문항 0개');

    console.log(`기존 ${existing.length}문항 / 새 파일 ${questions.length}문항`);
    // --allow-extra: 새 파일이 문항이 더 많을 때(9/29 중산고 — 옛 등록이 잘못돼 21 → 22). 기존 번호는 id 유지로 교체하고
    //   남는 번호만 새 행으로 넣는다(기존 문항 행의 메타를 복사). 문항이 줄어드는 경우는 여전히 막는다(저장 시험지가 빈 문항을 가리키게 됨).
    const ALLOW_EXTRA = process.argv.includes('--allow-extra');
    if (questions.length !== existing.length && !(ALLOW_EXTRA && questions.length > existing.length))
        throw new Error(`문항 수가 다르다(${existing.length} → ${questions.length}). id 유지 교체는 수가 같을 때만 안전하다.`);

    const byNum = new Map(existing.map(e => [e.question_number, e.id]));
    const extra = questions.filter(q => !byNum.has(q.questionNumber));
    if (extra.length && !ALLOW_EXTRA)
        throw new Error(`새 파일의 ${extra[0].questionNumber}번에 대응하는 기존 문항이 없다`);
    if (extra.length) {
        const { data: tmpl, error: tErr } = await supabase.from('questions').select('*').eq('id', existing[0].id).single();
        if (tErr || !tmpl) throw new Error('템플릿 행 조회 실패: ' + tErr?.message);
        for (const q of extra) {
            const row: any = { ...tmpl };
            for (const k of ['id', 'created_at', 'updated_at', 'embedding', 'embedding_statement', 'unit', 'difficulty', 'key_concepts', 'layout_lines']) delete row[k];
            row.question_number = q.questionNumber;
            row.work_status = 'pending';
            const { data: ins, error: iErr } = await supabase.from('questions').insert(row).select('id').single();
            if (iErr || !ins) throw new Error(`Q${q.questionNumber} 신규 insert 실패: ${iErr?.message}`);
            byNum.set(q.questionNumber, ins.id);
            console.log(`ADDED Q${q.questionNumber} → ${ins.id}`);
        }
    }

    // 새 HML 백업 + files 행
    const fileId = randomUUID();
    const storagePath = `raw_uploads/${fileId}.hml`;
    const { error: upErr } = await originals.upload(storagePath, hmlContent, { contentType: 'text/xml' });
    if (upErr) console.warn('HML 백업 경고(계속):', upErr.message);
    const { error: fErr } = await supabase.from('files')
        .insert({ id: fileId, original_name: hmlPath.split(/[\/]/).pop(), storage_path: storagePath });
    if (fErr) throw new Error('files insert 실패: ' + fErr.message);

    const imageMap = new Map(images.map(img => [img.binId, img]));
    let updated = 0, imgIns = 0;
    for (const q of questions) {
        const id = byNum.get(q.questionNumber)!;
        const { error: uErr } = await supabase.from('questions').update({
            file_id: fileId, question_index: q.questionNumber,
            fragment_xml: '', fragment_len: q.contentXml.length, content_xml: q.contentXml,
            equation_scripts: q.equationScripts, plain_text: q.plainText,
            // 아래는 새로 만들어야 하는 것들 — 비워서 파이프라인이 다시 채우게 한다
            unit: null, difficulty: null, key_concepts: null, embedding: null,
            layout_lines: null, work_status: 'pending',
        }).eq('id', id);
        if (uErr) throw new Error(`Q${q.questionNumber} update 실패: ${uErr.message}`);
        updated++;

        // 이미지는 전량 교체(HML 내장 그림 + 캡쳐 모두 지우고 HML 것부터 다시)
        const { error: dErr } = await supabase.from('question_images').delete().eq('question_id', id);
        if (dErr) throw new Error(`Q${q.questionNumber} 이미지 삭제 실패: ${dErr.message}`);
        for (const binId of q.imageRefs) {
            const img = imageMap.get(binId);
            if (!img) continue;
            const { error: iErr } = await supabase.from('question_images').insert({
                question_id: id, original_bin_id: img.binId, format: img.format, data: img.data, size_bytes: img.sizeBytes,
            });
            if (iErr) throw new Error(`Q${q.questionNumber} 이미지 insert 실패: ${iErr.message}`);
            imgIns++;
        }
    }
    console.log(`REPLACED=${updated} IMAGES=${imgIns}`);
}
main().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
