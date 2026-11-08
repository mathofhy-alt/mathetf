const { privateOriginalStorage } = require('./original-storage.cjs');
// [단일 과목 ingest] 선택과목 HML 하나를 지정한 번호대로 등록한다.
// 사용: npx tsx scratch_single_ingest.ts <hml> <source_db_id> <subject> <year> <semester> <grade> <startNo>
//   예: ... "try/x.hml" "전국연합_2026_5월 모의고사_확률과 통계" "확률과통계" 2026 "5월 모의고사" 고3 23
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { parseHmlV2 } from '../src/lib/hml-v2/parser';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const [HML, SRC, SUBJECT, YEAR, SEMESTER, GRADE, START] = process.argv.slice(2);
if (!START) { console.error('인자 부족'); process.exit(1); }
const startNo = Number(START);

async function main() {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const originals = await privateOriginalStorage(sb);

    const { count } = await sb.from('questions').select('id', { count: 'exact', head: true }).eq('source_db_id', SRC);
    if ((count ?? 0) > 0) { console.log(`EXISTS ${SRC}=${count}`); process.exitCode = 3; return; }

    const orig = console.log; console.log = () => { };
    const hml = readFileSync(HML, 'utf-8');
    const { questions, images } = parseHmlV2(hml);
    console.log = orig;
    console.log(`파싱: ${questions.length}문항 / 이미지 ${images.length}개`);

    const fileId = randomUUID();
    const storagePath = `raw_uploads/${fileId}.hml`;
    const { error: upErr } = await originals.upload(storagePath, hml, { contentType: 'text/xml' });
    if (upErr) console.warn('HML 백업 경고(계속):', upErr.message);
    const { error: fErr } = await sb.from('files').insert({ id: fileId, original_name: HML.split('/').pop(), storage_path: storagePath });
    if (fErr) throw new Error('files insert 실패: ' + fErr.message);

    const imgMap = new Map(images.map(i => [i.binId, i]));
    const idOrder: string[] = [];
    const sorted = [...questions].sort((a, b) => a.questionNumber - b.questionNumber);

    for (let i = 0; i < sorted.length; i++) {
        const q = sorted[i];
        const saveNo = startNo + i;   // 파일 1~8 → 실제 시험지 번호 23~30
        const { data, error } = await sb.from('questions').insert({
            file_id: fileId,
            question_index: saveNo,
            fragment_xml: q.contentXml, fragment_len: q.contentXml.length, content_xml: q.contentXml,
            subject: SUBJECT, region: '전국', district: '전국', school: '전국연합',
            grade: GRADE, year: YEAR, semester: SEMESTER, source_db_id: SRC,
            question_number: saveNo,
            equation_scripts: q.equationScripts, plain_text: q.plainText,
        }).select('id').single();
        if (error) throw new Error(`파일${q.questionNumber}(→${saveNo}번) insert 실패: ${error.message}`);
        idOrder.push(data.id);
        for (const binId of (q.imageRefs || [])) {
            const img = imgMap.get(binId);
            if (!img) continue;
            await sb.from('question_images').insert({
                question_id: data.id, original_bin_id: img.binId, format: img.format, data: img.data, size_bytes: img.sizeBytes,
            });
        }
    }
    console.log(`  ${SUBJECT}: 파일 1~${sorted.length} → 저장 ${startNo}~${startNo + sorted.length - 1}`);
    console.log(`QCOUNT=${idOrder.length}`);
}
main().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
