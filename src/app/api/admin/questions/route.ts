import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET: Filter by work_status
import { requireAdmin } from '@/utils/admin-auth';

// GET: Filter by work_status
const startTime = Date.now();
const { authorized, response } = await requireAdmin();
const authTime = Date.now() - startTime;
if (!authorized) return response;

const supabase = createClient();
const { searchParams } = new URL(req.url);

const q = searchParams.get('q') || '';
const school = searchParams.get('school') || '';
const subject = searchParams.get('subject') || '';
const unit = searchParams.get('unit') || '';
const status = searchParams.get('status') || 'all';
const page = parseInt(searchParams.get('page') || '1');
const limit = 10;
const start = (page - 1) * limit;

let queryBuilder = supabase
    .from('questions')
    .select(`
            id,
            question_number,
            question_index,
            content_xml,
            subject,
            grade,
            year,
            semester,
            school,
            work_status,
            unit,
            key_concepts,
            difficulty,
            source_db_id,
            created_at,
            question_images (
                id,
                original_bin_id,
                format,
                size_bytes
            )
        `); // Disabled count to test speed

// Status Filter (Simplified)
if (status === 'sorted') {
    queryBuilder = queryBuilder.eq('work_status', 'sorted');
} else if (status === 'unsorted') {
    queryBuilder = queryBuilder.neq('work_status', 'sorted');
}

if (q && q.trim() !== '') {
    if (q.startsWith('#')) {
        queryBuilder = queryBuilder.contains('key_concepts', [q]);
    } else {
        queryBuilder = queryBuilder.or(`plain_text.ilike.%${q}%,source_db_id.ilike.%${q}%,unit.ilike.%${q}%`);
    }
}
if (school && school.trim() !== '') {
    queryBuilder = queryBuilder.ilike('source_db_id', `%${school}%`);
}
if (subject && subject.trim() !== '') {
    queryBuilder = queryBuilder.eq('subject', subject);
}
if (unit && unit.trim() !== '') {
    queryBuilder = queryBuilder.eq('unit', unit);
}

// New Filters
const gradeFilter = searchParams.get('grade');
const yearFilter = searchParams.get('year');
const semesterFilter = searchParams.get('semester');

if (gradeFilter && gradeFilter.trim() !== '') queryBuilder = queryBuilder.eq('grade', gradeFilter);
if (yearFilter && yearFilter.trim() !== '') queryBuilder = queryBuilder.eq('year', yearFilter);
if (semesterFilter && semesterFilter.trim() !== '') queryBuilder = queryBuilder.eq('semester', semesterFilter);

// Multi-level sorting
queryBuilder = queryBuilder
    .order('year', { ascending: false })
    .order('semester', { ascending: true })
    .order('school', { ascending: true })
    .order('question_number', { ascending: true });

queryBuilder = queryBuilder.range(start, start + limit - 1);

const queryStartTime = Date.now();
const { data, error } = await queryBuilder;
const queryTime = Date.now() - queryStartTime;

if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
}

return NextResponse.json({
    success: true,
    data,
    count: data?.length || 0, // Mock count for now
    page,
    limit,
    debug: {
        authTime,
        queryTime,
        totalTime: Date.now() - startTime
    }
});
}

export async function DELETE(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    const supabase = createClient();

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

    const supabase = createClient();

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
