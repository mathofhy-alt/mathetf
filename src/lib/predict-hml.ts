import { createAdminClient } from '@/utils/supabase/server-admin';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * 예상문제 문항 id 목록 → 수학ETF 양식 .hml 문자열 생성.
 * HWP 다운로드(/api/predict/hwp)와 PDF 변환(/api/predict/pdf)이 공유.
 */
export async function buildPredictHml(ids: string[], title: string): Promise<string> {
    const admin = createAdminClient();
    const { data: qData, error } = await admin.from('questions').select('*').in('id', ids);
    if (error) throw new Error('문항 조회 실패: ' + error.message);
    const { data: imgData } = await admin.from('question_images').select('*').in('question_id', ids);

    const byQ = new Map<string, any[]>();
    for (const img of (imgData || [])) {
        try {
            let buffer: Buffer | null = null;
            if (img.data && (img.data.startsWith('http://') || img.data.startsWith('https://'))) {
                const res = await fetch(img.data);
                if (res.ok) buffer = Buffer.from(await res.arrayBuffer());
            } else if (img.data && typeof img.data === 'string') {
                buffer = Buffer.from(img.data, 'base64');
                const head = buffer.subarray(0, 2).toString('hex');
                const isRaster = head === '8950' || head === 'ffd8' || head === '5249' || buffer.subarray(0, 2).toString('ascii') === 'BM';
                const isSvg = buffer.subarray(0, 5).toString('ascii').toLowerCase().startsWith('<svg') || buffer.subarray(0, 2).toString('ascii') === '<s';
                if (!isRaster && !isSvg) {
                    try { buffer = zlib.inflateRawSync(buffer); } catch { try { buffer = zlib.inflateSync(buffer); } catch { } }
                }
            }
            if (buffer) { img.data = buffer.toString('base64'); img.size_bytes = buffer.length; }
        } catch { }
        if (!byQ.has(img.question_id)) byQ.set(img.question_id, []);
        byQ.get(img.question_id)!.push(img);
    }

    const qMap = new Map((qData || []).map((q: any) => [q.id, q]));
    const questions = ids.map((id) => qMap.get(id)).filter(Boolean) as any[];
    questions.forEach((q, idx) => {
        if (!q.content_xml || q.content_xml.trim().length === 0) {
            q.content_xml = q.fragment_xml || `<P ParaShape="0" Style="0"><TEXT CharShape="0"></TEXT></P>`;
        }
        q.question_number = idx + 1;
        q.images = byQ.get(q.id) || [];
    });
    if (questions.length === 0) throw new Error('문항이 없습니다.');

    let templatePath = path.join(process.cwd(), '수학ETF양식.hml');
    if (!fs.existsSync(templatePath)) templatePath = path.join(process.cwd(), '재조립양식.hml');
    if (!fs.existsSync(templatePath)) templatePath = path.join(process.cwd(), 'template.hml');
    if (!fs.existsSync(templatePath)) throw new Error('템플릿 파일이 없습니다.');
    const templateXml = fs.readFileSync(templatePath, 'utf-8');

    const { generateHmlFromTemplate } = await import('@/lib/hml-v2/generator');
    const titleStr = title.replace(/[\\/<>:"|?*]/g, '_').trim() || '예상문제';
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
    const result = await generateHmlFromTemplate(templateXml, questions.map((q) => ({ question: q, images: q.images || [] })), {
        title: titleStr, date: dateStr, questionsPerColumn: 2,
    });
    if (!result) throw new Error('HML 생성 실패');
    return result.hmlContent;
}
