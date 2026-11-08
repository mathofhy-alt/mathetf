const { privateOriginalStorage } = require('./original-storage.cjs');
// [파일럿] 서라벌고2 2학기중간 수학II — ingest-hml 라우트와 동일 로직을 로컬(service role)로 실행
// (어드민 세션 없이 파이프라인을 돌리기 위해 route 로직 복제: parseHmlV2 → files/questions/question_images)
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { parseHmlV2 } from '../src/lib/hml-v2/parser';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const HML_PATH = 'try/서울노원구_2025년_2중간_서라벌고2_수2.hml';
const META = {
    school: '서라벌고등학교',
    region: '서울',
    district: '노원구',
    year: '2025',
    semester: '2학기중간',
    subject: '수학II',
    grade: '고2',
};

async function main() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const originals = await privateOriginalStorage(supabase);

    const hmlContent = readFileSync(HML_PATH, 'utf-8');
    console.log(`HML 크기: ${hmlContent.length} chars`);

    const { questions, images } = parseHmlV2(hmlContent);
    console.log(`파싱 결과: 문항 ${questions.length}개, 이미지 ${images.length}개`);
    console.log('문항 번호:', questions.map(q => q.questionNumber).join(', '));
    if (questions.length === 0) throw new Error('파싱 실패: 문항 0개');

    const fileId = randomUUID();
    const storagePath = `raw_uploads/${fileId}.hml`;
    const { error: upErr } = await originals.upload(storagePath, hmlContent, { contentType: 'text/xml' });
    if (upErr) console.warn('원본 HML 백업 업로드 경고(계속 진행):', upErr.message);

    const { error: fileErr } = await supabase.from('files').insert({ id: fileId, original_name: HML_PATH.split('/').pop(), storage_path: storagePath });
    if (fileErr) throw new Error('files insert 실패: ' + fileErr.message);

    const source_db_id = `${META.school}_${META.year}_${META.semester}_${META.subject}`;
    const imageMap = new Map(images.map(img => [img.binId, img]));
    const savedIds: string[] = [];

    for (const q of questions) {
        const { data: qData, error: qErr } = await supabase.from('questions').insert({
            file_id: fileId,
            question_index: q.questionNumber,
            fragment_xml: q.contentXml,
            fragment_len: q.contentXml.length,
            content_xml: q.contentXml,
            subject: META.subject,
            region: META.region,
            district: META.district,
            school: META.school,
            grade: META.grade,
            year: META.year,
            semester: META.semester,
            source_db_id,
            question_number: q.questionNumber,
            equation_scripts: q.equationScripts,
            plain_text: q.plainText,
        }).select('id').single();
        if (qErr) throw new Error(`Q${q.questionNumber} insert 실패: ${qErr.message}`);
        savedIds.push(qData.id);

        for (const binId of q.imageRefs) {
            const img = imageMap.get(binId);
            if (!img) { console.warn(`  Q${q.questionNumber}: 이미지 ${binId} 참조 누락`); continue; }
            const { error: imgErr } = await supabase.from('question_images').insert({
                question_id: qData.id,
                original_bin_id: img.binId,
                format: img.format,
                data: img.data,
                size_bytes: img.sizeBytes,
            });
            if (imgErr) console.error(`  Q${q.questionNumber} 이미지 insert 실패:`, imgErr.message);
        }
    }

    console.log(`\n완료: source_db_id=${source_db_id}`);
    console.log(`file_id=${fileId}, 문항 ${savedIds.length}개 저장`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
