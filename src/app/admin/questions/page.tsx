import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/utils/admin-auth';
import AdminQuestionsClient from './AdminQuestionsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminQuestionsPage() {
    // 1. Server-side Authentication (ONE TIME)
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    const supabase = createClient();
    const startTime = Date.now();

    // 2. Parallel Pre-fetching (Questions, Regions, Concept Suggestions)
    const [
        questionsRes,
        regionsRes,
        suggestionsRes
    ] = await Promise.all([
        // Initial 10 Unsorted Questions (matching default tab)
        supabase
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
                    size_bytes,
                    data
                )
            `, { count: 'exact' })
            .neq('work_status', 'sorted')
            .order('year', { ascending: false })
            .order('semester', { ascending: true })
            .order('school', { ascending: true })
            .order('question_number', { ascending: true })
            .range(0, 9),

        // Initial Regions
        supabase
            .from('schools')
            .select('region')
            .limit(1000),

        // Initial Concept Suggestions
        supabase
            .from('questions')
            .select('unit, key_concepts')
            .not('key_concepts', 'is', null)
            .order('created_at', { ascending: false })
            .limit(500)
    ]);

    const fetchTime = Date.now() - startTime;
    console.log(`[V90] Server Pre-fetch Time: ${fetchTime}ms`);

    // Process Regions
    const uniqueRegions = Array.from(new Set((regionsRes.data || []).map(i => i.region))).sort();

    // Process Suggestions
    const suggestions: Record<string, Set<string>> = {};
    (suggestionsRes.data || []).forEach(item => {
        if (item.unit && item.key_concepts) {
            const unit = item.unit.trim();
            let tags: string[] = [];
            if (Array.isArray(item.key_concepts)) {
                tags = item.key_concepts;
            } else if (typeof item.key_concepts === 'string') {
                tags = item.key_concepts.split(',').map((t: string) => t.trim()).filter(Boolean);
            }
            if (!suggestions[unit]) suggestions[unit] = new Set();
            tags.forEach((tag: string) => suggestions[unit].add(tag));
        }
    });
    const finalSuggestions: Record<string, string[]> = {};
    for (const unit in suggestions) {
        finalSuggestions[unit] = Array.from(suggestions[unit]).sort();
    }

    const initialData = {
        questions: questionsRes.data || [],
        total: questionsRes.count || 0,
        regions: uniqueRegions,
        conceptSuggestions: finalSuggestions
    };

    return <AdminQuestionsClient initialData={initialData} />;
}
