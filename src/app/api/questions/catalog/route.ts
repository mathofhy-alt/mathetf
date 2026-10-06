import { NextResponse } from 'next/server';
import { availableCatalog } from '@/lib/questions/catalog';
import { privateCatalog } from '@/lib/questions/privateDb';
export const dynamic = 'force-dynamic';
// 출제 자료 목록 = 공개 DB + 이 회원이 결제한 전용 개인DB(10/6)
export async function GET() {
    try {
        const [shared, mine] = await Promise.all([availableCatalog(), privateCatalog()]);
        return NextResponse.json({ success: true, data: [...shared, ...mine] });
    }
    catch { return NextResponse.json({ success: false, error: '자료 목록을 불러오지 못했습니다.' }, { status: 503 }); }
}
