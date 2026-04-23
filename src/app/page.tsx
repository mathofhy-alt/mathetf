import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { unstable_cache } from 'next/cache';
import HomeClient from './HomeClient';

// Schools data cached for 1 hour (rarely changes)
const getCachedSchools = unstable_cache(
    async () => {
        const supabase = createAdminClient();
        let allSchoolData: any[] = [];
        let from = 0;
        while (true) {
            const { data, error } = await supabase
                .from('schools')
                .select('region, district, name')
                .range(from, from + 999);
            if (error || !data || data.length === 0) break;
            allSchoolData = [...allSchoolData, ...data];
            if (data.length < 1000) break;
            from += 1000;
        }
        return allSchoolData;
    },
    ['schools-data'],
    { revalidate: 3600 }
);

export default async function ExamPlatformPage() {
    const supabase = createClient();

    // 1. Get user session server-side
    const { data: { user } } = await supabase.auth.getUser();
    const isAdmin = user?.email === 'mathofhy@naver.com';

    // 2. Fetch exam materials server-side (instant HTML render)
    const { data: examData } = await supabase
        .from('exam_materials')
        .select('*')
        .neq('school', 'DELETED')
        .order('created_at', { ascending: false });

    // 3. Schools data (cached)
    const schoolsRaw = await getCachedSchools();

    return (
        <HomeClient
            initialExamData={examData || []}
            initialSchoolsRaw={schoolsRaw}
            initialUser={user}
            isAdmin={isAdmin}
        />
    );
}
