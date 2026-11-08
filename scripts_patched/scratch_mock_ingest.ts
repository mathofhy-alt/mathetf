const { privateOriginalStorage } = require('./original-storage.cjs');
// [모의고사 전용] 한 HML(46문항)을 4개 과목으로 분할 등록.
//   파일 내 1~22=공통, 23~30=확통, 31~38=미적분, 39~46=기하
//   선택과목은 실제 시험지 번호(23~30)로 되돌려 저장 — 기존 2023~2025 회차와 동일 구조
// 사용: npx tsx scratch_mock_ingest.ts <hml> <연도> <월> [주관] [학년]
//   주관 기본값 '전국연합'. 고3 6·9월은 평가원(한국교육과정평가원) 주관이라 '평가원' 을 넘긴다.
//   학년 기본값 '고3'.
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { parseHmlV2 } from '../src/lib/hml-v2/parser';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const [HML, YEAR, MONTH, ORG = '전국연합', GRADE = '고3'] = process.argv.slice(2);
if (!MONTH) { console.error('사용: scratch_mock_ingest.ts <hml> <연도> <월>'); process.exit(1); }

// (파일내 시작번호, 개수, 과목, 저장시작번호)
const BLOCKS: [number, number, string, number][] = [
    [1, 22, '공통(수1,수2)', 1],
    [23, 8, '확률과 통계', 23],
    [31, 8, '미적분II', 23],
    [39, 8, '기하와벡터', 23],
];

async function main() {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const originals = await privateOriginalStorage(sb);
    const orig = console.log; console.log = () => { };
    const hml = readFileSync(HML, 'utf-8');
    const { questions, images } = parseHmlV2(hml);
    console.log = orig;
    console.log(`파싱: ${questions.length}문항 / 이미지 ${images.length}개`);
    if (questions.length !== 46) console.warn(`⚠ 46문항이 아님 (${questions.length}) — 블록 경계 확인 필요`);

    const semester = `${MONTH}월 모의고사`;
    // 중복 가드
    for (const [, , subj] of BLOCKS) {
        const src = `${ORG}_${YEAR}_${semester}_${subj}`;
        const { count } = await sb.from('questions').select('id', { count: 'exact', head: true }).eq('source_db_id', src);
        if ((count ?? 0) > 0) { console.log(`EXISTS ${src}=${count}`); process.exitCode = 3; return; }
    }

    const fileId = randomUUID();
    const storagePath = `raw_uploads/${fileId}.hml`;
    const { error: upErr } = await originals.upload(storagePath, hml, { contentType: 'text/xml' });
    if (upErr) console.warn('HML 백업 경고(계속):', upErr.message);
    const { error: fErr } = await sb.from('files').insert({ id: fileId, original_name: HML.split('/').pop(), storage_path: storagePath });
    if (fErr) throw new Error('files insert 실패: ' + fErr.message);

    const imgMap = new Map(images.map(i => [i.binId, i]));
    const idOrder: string[] = [];   // 파일 순서(1~46)대로 question id — 캡쳐 매칭용

    for (const [from, cnt, subj, saveFrom] of BLOCKS) {
        const src = `${ORG}_${YEAR}_${semester}_${subj}`;
        for (let i = 0; i < cnt; i++) {
            const fileNo = from + i;
            const q = questions.find(x => x.questionNumber === fileNo);
            if (!q) { console.warn(`⚠ 파일 ${fileNo}번 없음 — 건너뜀`); continue; }
            const saveNo = saveFrom + i;
            const { data, error } = await sb.from('questions').insert({
                file_id: fileId,
                question_index: saveNo,
                fragment_xml: q.contentXml, fragment_len: q.contentXml.length, content_xml: q.contentXml,
                subject: subj, region: '전국', district: '전국', school: ORG,
                grade: GRADE, year: YEAR, semester, source_db_id: src,
                question_number: saveNo,
                equation_scripts: q.equationScripts, plain_text: q.plainText,
            }).select('id').single();
            if (error) throw new Error(`파일${fileNo}(${subj} ${saveNo}번) insert 실패: ${error.message}`);
            idOrder[fileNo - 1] = data.id;
            for (const binId of (q.imageRefs || [])) {
                const img = imgMap.get(binId);
                if (!img) continue;
                await sb.from('question_images').insert({
                    question_id: data.id, original_bin_id: img.binId, format: img.format, data: img.data, size_bytes: img.sizeBytes,
                });
            }
        }
        console.log(`  ${subj}: 파일 ${from}~${from + cnt - 1} → 저장 ${saveFrom}~${saveFrom + cnt - 1}`);
    }
    console.log('IDORDER=' + idOrder.join(','));
    console.log(`QCOUNT=${idOrder.filter(Boolean).length}`);
}
main().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
