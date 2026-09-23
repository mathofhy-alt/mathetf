import { NextResponse } from 'next/server';
import { availableCatalog } from '@/lib/questions/catalog';
export const dynamic = 'force-dynamic';
export async function GET() {
    try { return NextResponse.json({ success: true, data: await availableCatalog() }); }
    catch { return NextResponse.json({ success: false, error: '자료 목록을 불러오지 못했습니다.' }, { status: 503 }); }
}
