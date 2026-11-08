const { privateOriginalStorage } = require('./original-storage.cjs');
// [배치] HML 파싱 → questions/question_images (ingest-hml 로직, argv 구동, 중복 가드)
// 사용: npx tsx scratch_batch_ingest.ts <hml경로> <학교> <시도> <구군> <연도> <학기라벨> <과목> <학년>
// 종료코드: 0=신규 등록(QCOUNT=n 출력) / 3=이미 존재(EXISTS=n 출력, 파이프라인 계속 진행용)
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { parseHmlV2 } from '../src/lib/hml-v2/parser';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const [hmlPath, school, region, district, year, semester, subject, grade, srcArg] = process.argv.slice(2);
if (!grade) { console.error('인자 부족'); process.exit(1); }

async function main() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const originals = await privateOriginalStorage(supabase);
    // [10/16] 배치(scratch_batch_run.src_for)가 정한 출처 이름을 받는다 — 학년만 다른 같은 과목은 '…_N학년_과목'.
    //   예전처럼 여기서 따로 조립하면 3학년 기하가 2학년 기하 이름으로 들어가 섞였다(용화여고 2026 2중간).
    const source_db_id = srcArg || `${school}_${year}_${semester}_${subject}`;
    // [11/8 대표 지시] 고3 6·9월 = 평가원_, 11월 = 수능_. 전국연합_ 은 고3 3·4·5·7·10월과 고1·고2 뿐.
    //   2023~2026 고3 322문항이 전국연합_ 으로 들어가 정정했다(mathetf-1f). 같은 실수면 등록을 막는다.
    if (grade === '고3' && /^전국연합_\d{4}_(6|9|11)월/.test(source_db_id)) {
        console.error(`회차 이름 오류: 고3 6·9월은 평가원_, 11월은 수능_ 이어야 함 → ${source_db_id}`);
        return;
    }

    // ⚠ process.exit() 금지 — tsx가 Python subprocess 안에서 libuv assertion으로 크래시함(Windows).
    //   마커 출력 후 자연 종료; 오케스트레이터는 종료코드가 아니라 마커(EXISTS=/QCOUNT=)를 신뢰.
    // ⚠ 중복 가드는 source_db_id + grade 로 본다.
    //   고1·고2 모의고사는 한 source_db_id('..._전과목')를 학년끼리 공유한다(기존 2020~2025 관례).
    //   source_db_id 만 보면 고1을 넣은 뒤 고2가 EXISTS 로 조용히 건너뛴다(2026-09-04 실제 발생).
    const hmlContent = readFileSync(hmlPath, 'utf-8');
    const { questions, images } = parseHmlV2(hmlContent);
    if (questions.length === 0) throw new Error('파싱 실패: 문항 0개');

    const { data: existing } = await supabase.from('questions').select('id, work_status')
        .eq('source_db_id', source_db_id).eq('grade', grade);
    const count = existing?.length ?? 0;
    if (count > 0) {
        // 9/8: 지난 실행이 삽입 도중 소켓 오류로 죽으면 부분행(1~3개, unsorted)이 남는다.
        //   그대로 두면 다음 실행이 EXISTS 로 "기존 N문항 재사용" 해 버려 시험지가 N문항짜리로 굳는다.
        //   전부 unsorted 이고 파싱 문항수보다 적을 때만 부분행으로 보고 지운 뒤 다시 넣는다.
        const allUnsorted = existing!.every(r => r.work_status === 'unsorted');
        if (allUnsorted && count < questions.length) {
            const ids = existing!.map(r => r.id);
            await supabase.from('question_images').delete().in('question_id', ids);
            await supabase.from('questions').delete().in('id', ids);
            console.log(`PARTIAL_CLEANED=${count}`);
        } else { console.log(`EXISTS=${count}`); return; }
    }

    const fileId = randomUUID();
    const storagePath = `raw_uploads/${fileId}.hml`;
    const { error: upErr } = await originals.upload(storagePath, hmlContent, { contentType: 'text/xml' });
    if (upErr) console.warn('HML 백업 경고(계속):', upErr.message);
    const { error: fileErr } = await supabase.from('files').insert({ id: fileId, original_name: hmlPath.split('/').pop(), storage_path: storagePath });
    if (fileErr) throw new Error('files insert 실패: ' + fileErr.message);

    const imageMap = new Map(images.map(img => [img.binId, img]));
    for (const q of questions) {
        const row = {
            file_id: fileId, question_index: q.questionNumber,
            fragment_xml: '', fragment_len: q.contentXml.length, content_xml: q.contentXml,   // fragment_xml 은 content_xml 의 사본이었다 — 디스크 절반을 먹어 빈 값으로 둔다(9/30). 코드는 content_xml 이 비었을 때만 사본을 본다
            subject, region, district, school, grade, year, semester, source_db_id,
            question_number: q.questionNumber, equation_scripts: q.equationScripts, plain_text: q.plainText,
        };
        // 9/8: 'TypeError: fetch failed' 는 서버가 이미 INSERT 를 끝낸 뒤 keep-alive 소켓이 끊긴 경우가 있다
        //   (청심국제고 2번 — 행은 들어갔는데 클라이언트만 실패, 두 번 연속). 그냥 재시도하면 중복행이 생기므로
        //   재시도 전에 같은 (source_db_id, grade, question_number) 행이 있는지 먼저 본다.
        let qData: { id: string } | null = null, qErr: { message: string } | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            ({ data: qData, error: qErr } = await supabase.from('questions').insert(row).select('id').single());
            if (!qErr) break;
            if (!/fetch failed|ECONNRESET|socket/i.test(qErr.message)) break;
            await new Promise(r => setTimeout(r, 1500 * attempt));
            const { data: dup } = await supabase.from('questions').select('id')
                .eq('source_db_id', source_db_id).eq('grade', grade).eq('question_number', q.questionNumber).limit(1);
            if (dup && dup.length) { qData = dup[0]; qErr = null; console.log(`  Q${q.questionNumber}: 소켓 오류였지만 행은 있음 → 재사용`); break; }
            console.log(`  Q${q.questionNumber}: ${qErr.message} → 재시도 ${attempt}/3`);
        }
        if (qErr || !qData) throw new Error(`Q${q.questionNumber} insert 실패: ${qErr?.message}`);
        for (const binId of q.imageRefs) {
            const img = imageMap.get(binId);
            if (!img) continue;
            await supabase.from('question_images').insert({
                question_id: qData.id, original_bin_id: img.binId, format: img.format, data: img.data, size_bytes: img.sizeBytes,
            });
        }
    }
    console.log(`QCOUNT=${questions.length}`);
}
main().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
