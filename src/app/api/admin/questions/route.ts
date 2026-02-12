import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET: Filter by work_status
import { requireAdmin } from '@/utils/admin-auth';

// GET: Filter by work_status
export async function GET(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    const supabase = createClient();
    const { searchParams } = new URL(req.url);

    const q = searchParams.get('q') || '';
    const school = searchParams.get('school') || '';
    const subject = searchParams.get('subject') || '';
    const unit = searchParams.get('unit') || ''; // Add specific unit filter
    const status = searchParams.get('status') || 'all'; // 'unsorted' | 'sorted' | 'all'
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 30;
    const start = (page - 1) * limit;

    let query = supabase
        .from('questions')
        .select('*, question_images(*)', { count: 'exact' });

    // Status Filter
    if (status !== 'all') {
        if (status === 'sorted') {
            query = query.eq('work_status', 'sorted');
        } else {
            // Default is everything NOT sorted (includes null, unsorted, empty string, etc)
            query = query.or('work_status.neq.sorted,work_status.is.null');
        }
    }

    if (q) {
        // Tag search if starts with #
        if (q.startsWith('#')) {
            query = query.contains('key_concepts', [q]);
        } else {
            // Search plain_text (content), source_db_id (school/exam info), and unit
            query = query.or(`plain_text.ilike.%${q}%,source_db_id.ilike.%${q}%,unit.ilike.%${q}%`);
        }
    }
    if (school) {
        query = query.ilike('source_db_id', `%${school}%`);
    }
    if (subject) {
        query = query.eq('subject', subject);
    }
    if (unit) {
        query = query.eq('unit', unit);
    }

    // New Filters
    const grade = searchParams.get('grade');
    const year = searchParams.get('year');
    const semester = searchParams.get('semester');

    if (grade) query = query.eq('grade', grade);
    if (year) query = query.eq('year', year);
    if (semester) query = query.eq('semester', semester);

    // Multi-level sorting: Year (Newest first), Semester, School, and Number
    query = query
        .order('year', { ascending: false })
        .order('semester', { ascending: true })
        .order('school', { ascending: true })
        .order('question_number', { ascending: true })
        .order('created_at', { ascending: false }); // Final fallback
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
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    const supabase = createAdminClient();

    try {
        const body = await req.json();
        const { ids, deleteAll, deleteUnsortedOnly } = body;

        let query = supabase.from('questions').delete();

        if (deleteAll) {
            // DANGER: Deletes absolutely everything
            query = query.gte('question_number', 0);
        } else if (deleteUnsortedOnly) {
            // SAFE MODE: Deletes only questions that are NOT sorted
            query = query.or('work_status.neq.sorted,work_status.is.null');
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
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

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
        const allowedFields = ['question_number', 'subject', 'grade', 'unit', 'key_concepts', 'difficulty', 'region', 'district', 'school', 'year', 'semester', 'work_status'];
        const cleanUpdates: any = {};
        for (const key of allowedFields) {
            if (updates[key] !== undefined) {
                let value = updates[key];
                // Auto-convert key_concepts to array and ensure '#' prefix
                if (key === 'key_concepts') {
                    let tags: string[] = [];
                    if (typeof value === 'string') {
                        tags = value.split(',').map((t: string) => t.trim()).filter(Boolean);
                    } else if (Array.isArray(value)) {
                        tags = value.map((t: any) => String(t).trim()).filter(Boolean);
                    }

                    if (tags.length > 0 || Array.isArray(value)) {
                        value = tags.map(t => t.startsWith('#') ? t : `#${t}`);
                    }
                }
                cleanUpdates[key] = value;
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
