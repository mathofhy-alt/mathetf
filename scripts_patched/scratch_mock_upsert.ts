const { privateOriginalStorage } = require('./original-storage.cjs');
// [모의고사 등록·교체] 한 회차 HML 을 문항 블록으로 나눠, 이미 있는 문항은 **id 를 유지한 채** 내용만 갈아끼우고
//   없는 문항·블록은 새로 넣는다 (10/2 — 트라이폴더 29회차, 사용자: "이미 있는 회차는 id 유지 교체 + 탭까지").
//
// 블록 (파일 내 **순서** 기준 — 고3 파일은 선택과목이 23~30번으로 세 번 반복돼 번호로는 못 가른다):
//   고1·고2: 30문항 한 덩어리 → source '…_전과목', 저장 번호 1~30
//   고3   : 순서 1~22 공통 / 23~30 확통 / 31~38 미적분 / 39~46 기하 → 저장 번호 1~22, 23~30
// 기존 회차는 source_db_id 접두(전국연합_/평가원_)·접미(공통(수1,수2)/전과목, 기하/기하와벡터 …)가 회차마다 달라
//   '%_{연도}_{월}월 모의고사_%' + 학년으로 찾고 접미를 블록으로 정규화한다. '모의고사변형_' 묶음은 건드리지 않는다.
//
// 사용: npx tsx scratch_mock_upsert.ts <hml> <연도> <월> <고1|고2|고3> <전국연합|평가원|수능> [가형|나형] [--dry]
//   가형·나형 회차(2018~2020 고2·고3 등)는 형마다 30문항 한 덩어리, source 접미가 형 이름이다(기존 관례).
// 출력: IDORDER=<파일 순서대로 question id>  (캡쳐 매칭용)
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { parseHmlV2 } from '../src/lib/hml-v2/parser';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const [HML, YEAR, MONTH, GRADE, SCHOOL] = process.argv.slice(2);
// 형 구분 회차: 가형·나형(2015~2020 등) / A형·B형(2012~2015 고3, 2013~2014 고2) — 10/3 A·B형 추가
const FORMS = ['가형', '나형', 'A형', 'B형'];
const FORM = process.argv.slice(7).find(a => FORMS.includes(a)) || '';
const DRY = process.argv.includes('--dry');
if (!SCHOOL) { console.error('사용: scratch_mock_upsert.ts <hml> <연도> <월> <학년> <주관>'); process.exit(1); }
const SEM = `${MONTH}월 모의고사`;

type Block = { key: string; srcName: string; from: number; count: number; saveFrom: number; subject: string };
// [10/6] 2006~2009 고3 가형 40문항 = 순서 1~25 공통 / 26~30 미분과적분 / 31~35 확률과통계 / 36~40 이산수학 (선택은 26~30번 반복).
//   요즘 고3(공통 22 + 선택 8×3)처럼 블록마다 source 를 따로 둔다. 개인DB 는 '공통|선택' 두 source 를 '|' 로 묶어 가리킨다(scope.ts).
const OLD_SEL = [['미분과적분', 25], ['확률과통계', 30], ['이산수학', 35]] as const;
const BLOCKS40: Block[] = [
    { key: FORM, srcName: `${FORM}_고3`, from: 0, count: 25, saveFrom: 1, subject: '대수' },
    ...OLD_SEL.map(([s, from]) => ({ key: s, srcName: `${FORM}_${s}_고3`, from, count: 5, saveFrom: 26, subject: s === '확률과통계' ? '확률과통계' : '미적분II' })),
];
let BLOCKS: Block[] = FORM ? [
    // 고3 형은 '…_{형}_고3' — 옛 source 엔 학년이 없어 같은 달 고2 가형과 묶음이 합쳐졌다(10/2 밤 2018·2019 3·6·9·11월)
    { key: FORM, srcName: GRADE === '고3' ? `${FORM}_고3` : FORM, from: 0, count: 30, saveFrom: 1, subject: '대수' },
] : GRADE === '고3' ? [
    { key: '공통', srcName: '공통(수1,수2)', from: 0, count: 22, saveFrom: 1, subject: '대수' },
    { key: '확통', srcName: '확률과 통계', from: 22, count: 8, saveFrom: 23, subject: '확률과통계' },
    { key: '미적', srcName: '미적분II', from: 30, count: 8, saveFrom: 23, subject: '미적분II' },
    { key: '기하', srcName: '기하와벡터', from: 38, count: 8, saveFrom: 23, subject: '기하와벡터' },
] : [
    { key: '전과목', srcName: '전과목', from: 0, count: 30, saveFrom: 1, subject: GRADE === '고1' ? '공통수학1' : '대수' },
];
// 기존 source 접미 → 블록 (회차마다 이름이 달랐다)
function blockOf(suffix: string): string | null {
    if (FORM) {
        const sel = OLD_SEL.find(([s]) => suffix === `${FORM}_${s}_고3`);
        if (sel) return sel[0];
        if (FORMS.some(f => OLD_SEL.some(([s]) => suffix === `${f}_${s}_고3`))) return 'skip';
        return (suffix === FORM || suffix === `${FORM}_고3`) ? FORM : (FORMS.some(f => suffix === f || suffix === `${f}_고3`) ? 'skip' : null);
    }
    // 고1·고2 30문항: 회차에 따라 '전과목'·'고2'·'공통(수1,수2)' 로 등록돼 있다(2022 6월 고2, 2024 3월 고2) — 한 덩어리로 본다
    if (GRADE !== '고3') return ['전과목', '고2', '전과목_고2', '공통(수1,수2)', '수학'].includes(suffix) ? '전과목' : null;
    if (['공통(수1,수2)', '전과목'].includes(suffix)) return '공통';
    if (['확률과 통계', '확률과통계'].includes(suffix)) return '확통';
    if (['미적분II', '미적분'].includes(suffix)) return '미적';
    if (['기하와벡터', '기하'].includes(suffix)) return '기하';
    return null;
}

async function main() {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const originals = await privateOriginalStorage(sb);
    const hml = readFileSync(HML, 'utf-8');
    const orig = console.log; console.log = () => { };
    const { questions, images } = parseHmlV2(hml);
    console.log = orig;
    if (FORM && GRADE === '고3' && questions.length === 40) BLOCKS = BLOCKS40;
    const want = BLOCKS.reduce((a, b) => a + b.count, 0);   // 형 회차는 고3 이라도 30문항
    if (questions.length !== want) throw new Error(`문항 수 ${questions.length} ≠ ${want}`);
    // 번호 순서 검증: 블록마다 saveFrom 부터 연속이어야 한다
    for (const b of BLOCKS) for (let i = 0; i < b.count; i++) {
        const n = questions[b.from + i].questionNumber;
        // [10/22] 2026 고3 10월 파일은 선택과목을 23~30 반복 대신 1~46 연속으로 매겼다 — 그것도 받는다(저장은 saveFrom 기준)
        if (n !== b.saveFrom + i && n !== b.from + 1 + i) throw new Error(`${b.key} 블록 ${i + 1}번째 문항 번호가 ${n} (기대 ${b.saveFrom + i})`);
    }

    // 기존 문항 (변형 묶음 제외)
    const { data: ex, error } = await sb.from('questions')
        .select('id, source_db_id, question_number, subject, school, year, semester, region, district')
        .like('source_db_id', `%\\_${YEAR}\\_${SEM}\\_%`).eq('grade', GRADE);
    if (error) throw new Error('기존 조회 실패: ' + error.message);
    const existing = (ex || []).filter(q => !q.source_db_id.includes('모의고사변형'));
    const byBlock = new Map<string, { src: string; byNum: Map<number, string> }>();
    for (const q of existing) {
        const suffix = q.source_db_id.split('_').slice(3).join('_');
        const k = blockOf(suffix);
        if (k === 'skip') continue;   // 같은 회차의 다른 형
        if (!k) throw new Error(`모르는 source 접미: ${q.source_db_id}`);
        const e = byBlock.get(k) || { src: q.source_db_id, byNum: new Map() };
        if (e.src !== q.source_db_id) throw new Error(`한 블록에 source 가 둘: ${e.src} / ${q.source_db_id}`);
        if (e.byNum.has(q.question_number)) throw new Error(`중복 번호 ${q.source_db_id} ${q.question_number}`);
        e.byNum.set(q.question_number, q.id);
        byBlock.set(k, e);
    }
    const mine = existing.filter(q => blockOf(q.source_db_id.split('_').slice(3).join('_')) !== 'skip');
    const prefix = mine[0]?.source_db_id.split('_')[0] || existing[0]?.source_db_id.split('_')[0] || SCHOOL;
    const school = mine[0]?.school || existing[0]?.school || SCHOOL;
    for (const b of BLOCKS) {
        const e = byBlock.get(b.key);
        console.log(`  ${b.key}: 기존 ${e ? `${e.byNum.size}문항 (${e.src})` : '없음 → 새로 넣음'}`);
    }
    if (DRY) { console.log('DRY'); return; }

    const fileId = randomUUID();
    const storagePath = `raw_uploads/${fileId}.hml`;
    const { error: upErr } = await originals.upload(storagePath, hml, { contentType: 'text/xml' });
    if (upErr) console.warn('HML 백업 경고(계속):', upErr.message);
    const { error: fErr } = await sb.from('files').insert({ id: fileId, original_name: HML.split(/[\\/]/).pop(), storage_path: storagePath });
    if (fErr) throw new Error('files insert 실패: ' + fErr.message);

    const imgMap = new Map(images.map(i => [i.binId, i]));
    const idOrder: string[] = [];
    let replaced = 0, inserted = 0;
    for (const b of BLOCKS) {
        const e = byBlock.get(b.key);
        const src = e?.src || `${prefix}_${YEAR}_${SEM}_${b.srcName}`;
        for (let i = 0; i < b.count; i++) {
            const q = questions[b.from + i];
            const saveNo = b.saveFrom + i;
            const content = {
                file_id: fileId, question_index: saveNo, fragment_xml: '', fragment_len: q.contentXml.length,
                content_xml: q.contentXml, equation_scripts: q.equationScripts, plain_text: q.plainText,
                unit: null, difficulty: null, key_concepts: null, embedding: null, embedding_statement: null,
                layout_lines: null, work_status: 'pending',
            };
            let id = e?.byNum.get(saveNo);
            if (id) {
                const { error: uErr } = await sb.from('questions').update(content).eq('id', id);
                if (uErr) throw new Error(`${b.key} ${saveNo}번 update 실패: ${uErr.message}`);
                const { error: dErr } = await sb.from('question_images').delete().eq('question_id', id);
                if (dErr) throw new Error(`${b.key} ${saveNo}번 이미지 삭제 실패: ${dErr.message}`);
                // 옛 유사 목록 삭제 → 하루 한 번 도는 precompute_similar.py 기본 모드가 이 단원을 다시 계산한다(10/2 3단 분리)
                await sb.from('question_similar').delete().eq('question_id', id);
                replaced++;
            } else {
                const { data, error: iErr } = await sb.from('questions').insert({
                    ...content, subject: b.subject, region: '전국', district: '전국', school,
                    grade: GRADE, year: YEAR, semester: SEM, source_db_id: src, question_number: saveNo,
                }).select('id').single();
                if (iErr || !data) throw new Error(`${b.key} ${saveNo}번 insert 실패: ${iErr?.message}`);
                id = data.id; inserted++;
            }
            idOrder[b.from + i] = id!;
            for (const binId of (q.imageRefs || [])) {
                const img = imgMap.get(binId);
                if (!img) continue;
                const { error: imErr } = await sb.from('question_images').insert({
                    question_id: id, original_bin_id: img.binId, format: img.format, data: img.data, size_bytes: img.sizeBytes,
                });
                if (imErr) throw new Error(`${b.key} ${saveNo}번 이미지 insert 실패: ${imErr.message}`);
            }
        }
    }
    console.log(`REPLACED=${replaced} INSERTED=${inserted}`);
    console.log('IDORDER=' + idOrder.join(','));
}
main().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
