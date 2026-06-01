import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
    const host = request.headers.get('host')
    
    // www.mathetf.com으로 접속했을 때 mathetf.com으로 영구 리디렉션 (SEO 최적화)
    if (host === 'www.mathetf.com') {
        const url = request.nextUrl.clone()
        url.host = 'mathetf.com'
        url.protocol = 'https'
        return NextResponse.redirect(url, 308)
    }

    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
