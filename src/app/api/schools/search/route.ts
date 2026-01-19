
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q');

        if (!query || query.length < 1) {
            return NextResponse.json({ schools: [] });
        }

        const supabase = createClient();

        // Search for schools starting with the query string
        const { data, error } = await supabase
            .from('schools')
            .select('id, name, region, district')
            .ilike('name', `${query}%`) // 'query%' for "starts with". '%query%' for contains.
            .limit(10);

        if (error) {
            console.error(error);
            return NextResponse.json({ schools: [] });
        }

        return NextResponse.json({ schools: data });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
