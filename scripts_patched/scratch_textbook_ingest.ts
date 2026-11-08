const { privateOriginalStorage } = require('./original-storage.cjs');
// [시중교재 등록] 단원 한 파일(HML)을 스텝 번호 범위로 나눠 source_db_id = '교재명 > 단원 > 스텝' 묶음으로 넣는다 (10/6).
//   ⚠ 회원 전용 상품이다(private_dbs). 공개되면 안 되므로:
//     - work_status 는 'pending' 으로만 넣는다(sorted 는 넣는 순간 전체 검색·유사문항에 공개된다).
//     - exam_materials 행을 만들지 않는다(홈·학교 페이지·사이트맵에 공개된다).
//     - 이미 있는 묶음은 건드리지 않고 멈춘다(연결 후 'private' 가 된 문항을 되돌리면 안 된다).
//   칸 값(홈페이지 세션과 합의): school=교재명, grade='고N', year=NULL, semester=NULL, region=NULL, question_number=교재 원래 번호.
//
// 사용: npx tsx scratch_textbook_ingest.ts <hml> <교재명> <단원 경로> <학년 고N> <과목> <스텝:시작-끝,...> [--dry]
//   예) ... '쎈 공통수학1' '01 다항식의 연산' 고1 공통수학1 'A:1-39,B:40-96,C:97-114'
// 출력: IDORDER=<파일 순서대로 question id>  (캡쳐 매칭용)
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true } as any);
import { createClient } from '@supabase/supabase-js';
import { parseHmlV2 } from '../src/lib/hml-v2/parser';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const [HML, BOOK, UNIT, GRADE, SUBJECT, STEPSPEC] = process.argv.slice(2);
const DRY = process.argv.includes('--dry');
if (!STEPSPEC) { console.error('사용: scratch_textbook_ingest.ts <hml> <교재명> <단원> <고N> <과목> <A:1-39,B:40-96>'); process.exit(1); }
for (const s of [BOOK, UNIT]) if (/[|]/.test(s) || /_[A-B가나]형$/.test(s)) throw new Error(`경로에 쓸 수 없는 이름: ${s}`);
const STEPS = STEPSPEC.split(',').map(x => { const m = x.match(/^(.+):(\d+)-(\d+)$/); if (!m) throw new Error('스텝 형식: ' + x); return { name: m[1], from: +m[2], to: +m[3] }; });
const pathOf = (step: string) => `${BOOK} > ${UNIT} > ${step}`;

async function main() {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const originals = await privateOriginalStorage(sb);
    const hml = readFileSync(HML, 'utf-8');
    const orig = console.log; console.log = () => { };
    const { questions, images } = parseHmlV2(hml);
    console.log = orig;

    // 번호 검증: 파일 번호가 스텝 범위를 빈틈없이 정확히 덮어야 한다
    const nums = questions.map(q => q.questionNumber);
    const want: number[] = []; for (const s of STEPS) for (let n = s.from; n <= s.to; n++) want.push(n);
    if (nums.join(',') !== want.join(',')) throw new Error(`번호 불일치: 파일 ${nums.length}문항(${nums[0]}~${nums[nums.length - 1]}) vs 범위 ${want.length}문항`);
    const stepOf = (n: number) => STEPS.find(s => s.from <= n && n <= s.to)!.name;

    // 이미 있는 묶음이면 멈춘다
    for (const s of STEPS) {
        const { count, error } = await sb.from('questions').select('id', { count: 'exact', head: true }).eq('source_db_id', pathOf(s.name));
        if (error) throw new Error('기존 조회 실패: ' + error.message);
        if (count) throw new Error(`이미 있는 묶음: ${pathOf(s.name)} (${count}문항) — 교체는 따로 처리`);
    }
    for (const s of STEPS) console.log(`  ${pathOf(s.name)}: ${s.to - s.from + 1}문항`);
    if (DRY) { console.log('DRY'); return; }

    const fileId = randomUUID();
    const { error: upErr } = await originals.upload(`raw_uploads/${fileId}.hml`, hml, { contentType: 'text/xml' });
    if (upErr) console.warn('HML 백업 경고(계속):', upErr.message);
    const { error: fErr } = await sb.from('files').insert({ id: fileId, original_name: HML.split(/[\\/]/).pop(), storage_path: `raw_uploads/${fileId}.hml` });
    if (fErr) throw new Error('files insert 실패: ' + fErr.message);

    const imgMap = new Map(images.map(i => [i.binId, i]));
    const idOrder: string[] = [];
    // [10/28] 교과서는 묶음(예제·문제…) 안 순서로 1,2,3… — '예제1,7,10' 은 예제 1·2·3번(대표 확인). 쎈 등 시중교재는 교재 원래 번호
    const localNo = new Map<string, number>();
    const numOf = (n: number) => { const k = stepOf(n); const v = (localNo.get(k) || 0) + 1; localNo.set(k, v); return v; };
    for (const q of questions) {
        const n = q.questionNumber;
        const qn = BOOK.includes('교과서') ? numOf(n) : n;
        let data: any = null, iErr: any = null;
        for (let t = 0; t < 4; t++) {   // 네트워크 끊김(fetch failed) 재시도 — 모의고사 등록 때 몇 번 났다
            ({ data, error: iErr } = await sb.from('questions').insert({
                file_id: fileId, question_index: n, fragment_xml: '', fragment_len: q.contentXml.length,
                content_xml: q.contentXml, equation_scripts: q.equationScripts, plain_text: q.plainText,
                subject: SUBJECT, region: null, district: null, school: BOOK, grade: GRADE, year: null, semester: null,
                source_db_id: pathOf(stepOf(n)), question_number: qn, work_status: 'pending', is_off_curriculum: false,
            }).select('id').single());
            if (!iErr || !/fetch failed/i.test(String(iErr.message))) break;
            await new Promise(r => setTimeout(r, 3000 * (t + 1)));
        }
        if (iErr || !data) throw new Error(`${n}번 insert 실패: ${iErr?.message}`);
        idOrder.push(data.id);
        for (const binId of (q.imageRefs || [])) {
            const img = imgMap.get(binId); if (!img) continue;
            const { error: imErr } = await sb.from('question_images').insert({ question_id: data.id, original_bin_id: img.binId, format: img.format, data: img.data, size_bytes: img.sizeBytes });
            if (imErr) throw new Error(`${n}번 이미지 insert 실패: ${imErr.message}`);
        }
    }
    console.log(`INSERTED=${idOrder.length}`);
    console.log(`IDORDER=${idOrder.join(',')}`);
}
main().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
