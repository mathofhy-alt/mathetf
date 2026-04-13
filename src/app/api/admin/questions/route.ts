import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceRoleClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/utils/admin-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Helper to get service role client
const getAdminClient = () => {
    return createServiceRoleClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

// GET: Filter by work_status
export async function GET(req: NextRequest) {
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
    const limit = 30;
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
            embedding,
            source_db_id,
            created_at,
            question_images (
                id,
                original_bin_id,
                format,
                data,
                size_bytes
            )
        `, { count: 'exact' });

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
    const { data, error, count } = await queryBuilder;
    const queryTime = Date.now() - queryStartTime;

    if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        data,
        count: count || 0,
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

    const adminClient = getAdminClient();

    try {
        const body = await req.json();
        const { ids, deleteAll, deleteUnsortedOnly } = body;

        let query = adminClient.from('questions').delete();
        let affectedGroups: any[] = [];

        // Pre-fetch affected groups to sync DB prices after deletion
        if (ids && Array.isArray(ids) && ids.length > 0) {
            const { data: updatedQs } = await adminClient.from('questions').select('school, year, grade, semester, subject').in('id', ids);
            if (updatedQs) affectedGroups = updatedQs;
        } else if (deleteUnsortedOnly) {
            const { data: updatedQs } = await adminClient.from('questions').select('school, year, grade, semester, subject').or('work_status.neq.sorted,work_status.is.null');
            if (updatedQs) affectedGroups = updatedQs;
        }

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

        // -- Sync DB prices for affected groups after deletion --
        if (affectedGroups.length > 0) {
            try {
                const uniqueGroups = Array.from(new Set(affectedGroups.map((q: any) => 
                    `${q.school}|${q.year}|${q.grade}|${q.semester}|${q.subject}`
                )));

                for (const groupKey of uniqueGroups) {
                    const [s_school, s_year, s_grade, s_sem, s_sub] = groupKey.split('|');
                    
                    const { data: allQs } = await adminClient
                        .from('questions')
                        .select('difficulty')
                        .eq('school', s_school)
                        .eq('year', s_year)
                        .eq('grade', s_grade)
                        .eq('semester', s_sem)
                        .eq('subject', s_sub);
                    
                    if (allQs) { // Even if 0, price becomes 0
                        let newPrice = 0;
                        allQs.forEach((q: any) => {
                            const diff = parseInt(String(q.difficulty)) || 1;
                            newPrice += diff * 500;
                        });

                        const gradeNum = Number(String(s_grade).replace(/[^0-9]/g, '')) || 0;
                        let examType = '';
                        if (s_sem.includes('중간')) examType = '중간고사';
                        else if (s_sem.includes('기말')) examType = '기말고사';

                        const shortSchool = s_school.replace(/고등학교|고/g, '');

                        let syncQuery = adminClient
                            .from('exam_materials')
                            .update({ price: newPrice })
                            .eq('content_type', '개인DB')
                            .ilike('school', `%${shortSchool}%`)
                            .eq('exam_year', Number(s_year))
                            .eq('grade', gradeNum)
                            .eq('subject', s_sub);
                        
                        if (examType) syncQuery = syncQuery.eq('exam_type', examType);
                        await syncQuery;
                    }
                }
            } catch (err) {
                console.error("Failed to sync DB price after deletion:", err);
            }
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    const adminClient = getAdminClient();

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

        const { data: updateResult, error } = await adminClient
            .from('questions')
            .update(cleanUpdates)
            .in('id', ids)
            .select();

        if (error) throw error;

        // --- [NEW] Sync exam_materials DB price if difficulty changed ---
        if (updates.difficulty !== undefined) {
            try {
                // 1. Get the distinct exam groups from the updated questions
                const { data: updatedQs } = await adminClient
                    .from('questions')
                    .select('school, year, grade, semester, subject')
                    .in('id', ids);
                
                if (updatedQs && updatedQs.length > 0) {
                    const uniqueGroups = Array.from(new Set(updatedQs.map((q: any) => 
                        `${q.school}|${q.year}|${q.grade}|${q.semester}|${q.subject}`
                    )));

                    for (const groupKey of uniqueGroups) {
                        const [s_school, s_year, s_grade, s_sem, s_sub] = groupKey.split('|');
                        
                        // 2. Recalculate price for this specific exam group
                        const { data: allQs } = await adminClient
                            .from('questions')
                            .select('difficulty')
                            .eq('school', s_school)
                            .eq('year', s_year)
                            .eq('grade', s_grade)
                            .eq('semester', s_sem)
                            .eq('subject', s_sub);
                        
                        if (allQs && allQs.length > 0) {
                            let newPrice = 0;
                            allQs.forEach((q: any) => {
                                const diff = parseInt(String(q.difficulty)) || 1;
                                newPrice += diff * 500;
                            });

                            // 3. Map to exam_materials fields
                            const gradeNum = Number(String(s_grade).replace(/[^0-9]/g, '')) || 0;
                            const semNum = Number(String(s_sem).replace(/[^0-9]/g, '')) || 1;
                            let examType = '';
                            if (s_sem.includes('중간')) examType = '중간고사';
                            else if (s_sem.includes('기말')) examType = '기말고사';

                            const shortSchool = s_school.replace(/고등학교|고/g, '');
                            
                            // 4. Update exam_materials where content_type = '개인DB'
                            // Note: we might have multiple DBs for the same exam if admin clicked multiple times, update all matching.
                            let query = adminClient
                                .from('exam_materials')
                                .update({ price: newPrice })
                                .eq('content_type', '개인DB')
                                .ilike('school', `%${shortSchool}%`)
                                .eq('exam_year', Number(s_year))
                                .eq('grade', gradeNum)
                                .eq('subject', s_sub);
                            
                            if (examType) {
                                query = query.eq('exam_type', examType);
                            }
                            
                            await query;
                        }
                    }
                }
            } catch (syncErr) {
                console.error('Failed to sync DB price after difficulty update:', syncErr);
            }
        }
        // ----------------------------------------------------------------

        return NextResponse.json({ success: true, count: ids.length });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
