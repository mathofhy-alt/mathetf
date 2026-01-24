import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export async function GET(req: NextRequest) {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);

    const q = searchParams.get('q') || '';
    const school = searchParams.get('school') || '';
    const subject = searchParams.get('subject') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 20;
    const start = (page - 1) * limit;

    let query = supabase
        .from('questions')
        .select('*, question_images(*)', { count: 'exact' });

    if (q) {
        query = query.ilike('plain_text', `%${q}%`);
    }
    if (school) {
        // source_db_id usually starts with "School_Year_Semester_Subject"
        query = query.ilike('source_db_id', `%${school}%`);
    }
    if (subject) {
        query = query.eq('subject', subject);
    }

    // Default order: newest first
    query = query.order('created_at', { ascending: false });

    // Pagination
    query = query.range(start, start + limit - 1);

    const { data, error, count } = await query;

    if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        data,
        count,
        page,
        limit
    });
}

export async function DELETE(req: NextRequest) {
    const supabase = createAdminClient();

    try {
        const body = await req.json();
        const { ids, deleteAll } = body;

        let query = supabase.from('questions').delete();

        if (deleteAll) {
            // Delete all records.
            // 'id' is UUID, so we can't compare with number.
            // Use 'question_number' (numeric) to match all rows.
            query = query.gte('question_number', 0);
        } else if (ids && Array.isArray(ids) && ids.length > 0) {
            query = query.in('id', ids);
        } else {
            return NextResponse.json({ success: false, error: 'No target specified' }, { status: 400 });
        }

        const { error } = await query;
        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const supabase = createAdminClient();

    try {
        const body = await req.json();
        const { ids, updates } = body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ success: false, error: 'No target IDs specified' }, { status: 400 });
        }
        if (!updates || Object.keys(updates).length === 0) {
            return NextResponse.json({ success: false, error: 'No updates provided' }, { status: 400 });
        }

        // Sanitize allowed updates
        const allowedFields = ['grade', 'unit', 'difficulty', 'region', 'district', 'school', 'year', 'semester'];
        const cleanUpdates: any = {};
        for (const key of allowedFields) {
            if (updates[key] !== undefined) {
                cleanUpdates[key] = updates[key];
            }
        }

        if (Object.keys(cleanUpdates).length === 0) {
            return NextResponse.json({ success: false, error: 'No valid update fields' }, { status: 400 });
        }

        const { error } = await supabase
            .from('questions')
            .update(cleanUpdates)
            .in('id', ids);

        if (error) throw error;

        return NextResponse.json({ success: true, count: ids.length });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
