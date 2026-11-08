const { privateOriginalStorage } = require('./original-storage.cjs');
// [시중교재 교체] 이미 등록된 교재 단원을 수정본 HML 로 갈아끼운다 — 문항 id 유지 (10/8, 사장님: "이미 디비에 있는데 내가 넣은건 전부 교체").
//   ⚠ work_status 는 절대 건드리지 않는다(private = 회원 전용, pending = 대기). 내신용 scratch_replace_inplace.ts 는 pending 으로 되돌리므로 쓰면 안 된다.
//   내용이 바뀐 문항만 unit·difficulty·key_concepts·embedding 을 비워 재태깅되게 한다(안 바뀐 문항은 태그 유지).
//   그림은 전량 교체: HML 내장 그림 재삽입 + 캡쳐(AUTO_/MANUAL_) 행·스토리지 파일 삭제 → prep 이 새 ㅈㄷ 크롭으로 다시 올린다.
// 사용: npx tsx scratch_textbook_replace.ts <hml> <idorder 파일(쉼표)> <A:1-39,B:40-96,...> [--dry]
// 출력: CHANGED=<id,...>  REPLACED=N
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true } as any);
import { createClient } from '@supabase/supabase-js';
import { parseHmlV2 } from '../src/lib/hml-v2/parser';
import { readFileSync } from 'fs';
import { randomUUID, createHash } from 'crypto';

const [HML, IDFILE, STEPSPEC] = process.argv.slice(2);
const DRY = process.argv.includes('--dry');
if (!STEPSPEC) { console.error('사용: scratch_textbook_replace.ts <hml> <idorder파일> <A:1-39,...> [--dry]'); process.exit(1); }
const STEPS = STEPSPEC.split(',').map(x => { const m = x.match(/^(.+):(\d+)-(\d+)$/); if (!m) throw new Error('스텝 형식: ' + x); return { from: +m[2], to: +m[3] }; });
// 한글이 내보낼 때마다 새로 매기는 개체 번호(InstId)·그림 bin 번호는 내용이 아니다 — 빼고 비교한다(안 빼면 전 문항이 '바뀜')
const norm = (x: string) => (x || '').replace(/\s(InstId|BinItem|BinData|ZOrder)="[^"]*"/g, '').replace(/data-hml-[a-z-]+-id="[^"]*"/g, '').replace(/\sdata-hml-orig-style="[^"]*"/g, '');
const md5 = (s: string) => createHash('md5').update(s).digest('hex');

async function main() {
    const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const sb = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const originals = await privateOriginalStorage(sb);
    const ids = readFileSync(IDFILE, 'utf-8').trim().split(',');
    const hml = readFileSync(HML, 'utf-8');
    const orig = console.log; console.log = () => { };
    const { questions, images } = parseHmlV2(hml);
    console.log = orig;

    const nums = questions.map(q => q.questionNumber);
    const stepName = (n: number) => (STEPSPEC.split(',').map(x => x.match(/^(.+):(\d+)-(\d+)$/)!).find(m => +m[2] <= n && n <= +m[3]) || [])[1];
    const seen: Record<string, number> = {};
    const localNo = nums.map(n => { const s = stepName(n) || ''; seen[s] = (seen[s] || 0) + 1; return seen[s]; });
    const want: number[] = []; for (const s of STEPS) for (let n = s.from; n <= s.to; n++) want.push(n);
    if (nums.join(',') !== want.join(',')) throw new Error(`번호 불일치: 파일 ${nums.length}문항(${nums[0]}~${nums[nums.length - 1]}) vs 범위 ${want.length}문항`);
    if (ids.length !== questions.length) throw new Error(`문항 수가 다르다: 기존 ${ids.length} / 새 파일 ${questions.length} — id 유지 교체 불가`);

    // 기존 행: id 순서 = 파일 순서(등록 때 IDORDER). 번호까지 맞는지 확인한다
    const old = new Map<string, any>();
    for (let k = 0; k < ids.length; k += 50) {
        const { data, error } = await sb.from('questions').select('id,question_number,content_xml,plain_text,equation_scripts,work_status').in('id', ids.slice(k, k + 50));
        if (error) throw new Error('기존 조회 실패: ' + error.message);
        for (const r of data!) old.set(r.id, r);
    }
    ids.forEach((id, i) => {
        const r = old.get(id);
        if (!r) throw new Error(`기존 문항 없음: ${id}`);
        // [10/25] 교과서는 등록 뒤 묶음(예제·문제…)마다 1번부터 다시 매겨져 있다 — 파일 번호 또는 묶음 안 순번이면 같은 문항으로 본다
        if (r.question_number !== nums[i] && r.question_number !== localNo[i]) throw new Error(`순서 불일치: ${i + 1}번째 기존 ${r.question_number}번 vs 새 ${nums[i]}번`);
    });

    const imgMap = new Map(images.map(i => [i.binId, i]));
    const oldImgs = new Map<string, any[]>();
    for (let k = 0; k < ids.length; k += 50) {
        const { data, error } = await sb.from('question_images').select('id,question_id,original_bin_id,data').in('question_id', ids.slice(k, k + 50));
        if (error) throw new Error('그림 조회 실패: ' + error.message);
        for (const r of data!) { if (!oldImgs.has(r.question_id)) oldImgs.set(r.question_id, []); oldImgs.get(r.question_id)!.push(r); }
    }
    const isCap = (b: string) => /^(AUTO|MANUAL)_[QS]_/.test(b || '');
    const changed: string[] = []; let layout = 0;
    questions.forEach((q, i) => {
        const id = ids[i]; const r = old.get(id);
        const oldPics = (oldImgs.get(id) || []).filter(x => !isCap(x.original_bin_id)).map(x => md5(x.data || '')).sort().join();
        const newPics = (q.imageRefs || []).map(b => imgMap.get(b)).filter(Boolean).map(x => md5(x!.data || '')).sort().join();
        // 재태깅 기준 = 글자·수식·그림 자체. 그림·표 크기만 바꾼 건(10/8 공통수학2 대부분) 단원·난이도와 무관 → 내용·캡쳐만 교체
        if (norm(r.content_xml) !== norm(q.contentXml)) layout++;
        if ((r.plain_text || '') !== (q.plainText || '') || JSON.stringify(r.equation_scripts || []) !== JSON.stringify(q.equationScripts || []) || oldPics !== newPics) changed.push(id);
    });
    console.log(`기존 ${ids.length}문항 · 조판 바뀐 문항 ${layout}개 · 재태깅(글자·수식·그림 변경) ${changed.length}개 · 상태 ${[...new Set([...old.values()].map(r => r.work_status))].join('/')}`);
    if (DRY) { console.log(`CHANGED=${changed.join(',')}`); console.log('DRY'); return; }

    const fileId = randomUUID();
    const { error: upErr } = await originals.upload(`raw_uploads/${fileId}.hml`, hml, { contentType: 'text/xml' });
    if (upErr) console.warn('HML 백업 경고(계속):', upErr.message);
    const { error: fErr } = await sb.from('files').insert({ id: fileId, original_name: HML.split(/[\\/]/).pop(), storage_path: `raw_uploads/${fileId}.hml` });
    if (fErr) throw new Error('files insert 실패: ' + fErr.message);

    const chg = new Set(changed);
    const capPrefix = `${URL}/storage/v1/object/public/hwpx/`;
    let n = 0;
    for (let i = 0; i < questions.length; i++) {
        const q = questions[i]; const id = ids[i];
        const patch: any = { file_id: fileId, fragment_len: q.contentXml.length, content_xml: q.contentXml, equation_scripts: q.equationScripts, plain_text: q.plainText };
        if (chg.has(id)) Object.assign(patch, { unit: null, difficulty: null, key_concepts: null, embedding: null, embedding_statement: null, layout_lines: null });
        let uErr: any = null;
        for (let t = 0; t < 4; t++) {
            ({ error: uErr } = await sb.from('questions').update(patch).eq('id', id));
            if (!uErr || !/fetch failed|timeout/i.test(String(uErr.message))) break;
            await new Promise(r => setTimeout(r, 3000 * (t + 1)));
        }
        if (uErr) throw new Error(`${q.questionNumber}번 update 실패: ${uErr.message}`);
        const olds = oldImgs.get(id) || [];
        const paths = olds.filter(x => isCap(x.original_bin_id) && (x.data || '').startsWith(capPrefix)).map(x => x.data.slice(capPrefix.length));
        if (olds.length) {
            const { error: dErr } = await sb.from('question_images').delete().eq('question_id', id);
            if (dErr) throw new Error(`${q.questionNumber}번 그림 삭제 실패: ${dErr.message}`);
        }
        if (paths.length) await sb.storage.from('hwpx').remove(paths);   // 실패해도 고아 파일일 뿐 — 계속
        for (const binId of (q.imageRefs || [])) {
            const img = imgMap.get(binId); if (!img) continue;
            const { error: imErr } = await sb.from('question_images').insert({ question_id: id, original_bin_id: img.binId, format: img.format, data: img.data, size_bytes: img.sizeBytes });
            if (imErr) throw new Error(`${q.questionNumber}번 그림 insert 실패: ${imErr.message}`);
        }
        n++;
    }
    console.log(`REPLACED=${n}`);
    console.log(`CHANGED=${changed.join(',')}`);
}
main().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
