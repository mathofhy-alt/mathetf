
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const { subject, unit, difficulty, count } = await req.json();

        const supabase = createClient();

        // Postgres 'random()' is efficient for small datasets. 
        // For large datasets, we might need a different approach, but this works for < 100k rows.
        let query = supabase.from('questions').select('*');

        if (subject) query = query.eq('subject', subject);
        if (unit && Array.isArray(unit) && unit.length > 0) {
            query = query.in('unit', unit);
        } else if (unit && typeof unit === 'string') {
            query = query.eq('unit', unit);
        }

        if (difficulty) {
            const diffNum = parseInt(String(difficulty), 10);
            if (!isNaN(diffNum)) {
                // Fuzzy match +/- 1
                const diffs = [diffNum - 1, diffNum, diffNum + 1]
                    .filter(d => d >= 1 && d <= 10)
                    .map(String);
                query = query.in('difficulty', diffs);
            } else {
                // Fallback for non-numeric difficulty (e.g. 'Easy') - though we switched to 1-10
                query = query.eq('difficulty', difficulty);
            }
        }

        // Random ordering
        // Note: Supabase JS doesn't have a direct .random() modifier in the builder easily exposed without RPC usually,
        // but we can try using a raw RPC or fetching more and shuffling.
        // For a robust implementation, we should create a 'get_random_questions' RPC function in SQL.

        // Temporary JS Shuffle for prototype (Not production ready for huge DBs)
        const { data, error } = await query.limit(100); // Fetch a candidate pool

        if (error) throw error;
        if (!data || data.length === 0) return NextResponse.json({ questions: [] });

        // Shuffle and slice
        const shuffled = data.sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, count || 10);

        return NextResponse.json({ questions: selected });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
