
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { buildBody } from '@/lib/hml/body-builder';
import { HmlTemplateManager } from '@/lib/hml/template-manager';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic'; // Prevent Next.js caching

export async function POST(req: NextRequest) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return new NextResponse('Unauthorized', { status: 401 });

    try {
        const body = await req.json();
        const ids: string[] = body.ids || [];
        let questions: any[] = body.questions || [];

        if (ids.length > 0) {
            const { data, error } = await supabase
                .from('questions')
                .select('*')
                .in('id', ids);

            if (error) throw new Error("DB Error");

            if (data) {
                const qMap = new Map();
                data.forEach(q => qMap.set(q.id, q));
                const expanded: any[] = [];
                ids.forEach(id => {
                    const q = qMap.get(id);
                    if (q) expanded.push({ ...q });
                });
                questions = expanded;
            }
        }

        if (questions.length === 0) return new NextResponse('No valid questions', { status: 400 });

        questions.forEach((q, idx) => {
            if (!q.content_xml || q.content_xml.trim().length === 0) {
                q.content_xml = `<P ParaShape="0" Style="0"><TEXT CharShape="0">[Error] Content Missing for Q${q.id}</TEXT></P>`;
            }
            q.question_number = idx + 1;
        });

        // Load Template
        const templatePath = path.join(process.cwd(), 'template.hml');
        if (!fs.existsSync(templatePath)) return new NextResponse('Template missing', { status: 500 });
        const templateXml = fs.readFileSync(templatePath, 'utf-8');

        // NEW: Surgical Injection Assembly
        const manager = new HmlTemplateManager();
        const finalHml = await manager.buildFinalHmlFile(templateXml, questions);

        const filename = `exam_${new Date().getTime()}.hml`;

        return new NextResponse(finalHml, {
            status: 200,
            headers: {
                'Content-Type': 'application/x-hwp',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });

    } catch (e: any) {
        return new NextResponse('Internal Error: ' + e.message, { status: 500 });
    }
}
