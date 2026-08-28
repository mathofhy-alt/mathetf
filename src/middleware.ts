import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import examRedirects from '@/lib/exam-redirects.json'

// 한 시험 회차가 exam_materials 3행(PDF·해설/HWP·해설/개인DB)으로 나뉘어 각각 /exam/{id} 페이지를 갖는다.
// 본문 유사도 실측 HWP vs 개인DB 99.6% — 구글이 중복으로 보고 색인 500페이지를
// '크롤링됨 - 현재 색인이 생성되지 않음'으로 옮겼다(8/29 진단).
// → 비대표 928개를 대표(PDF·해설)로 영구 이동시켜 회차 1개 = URL 1개로 만든다.
//
// ⚠ 왜 페이지가 아니라 미들웨어인가
//   page.tsx 에서 permanentRedirect() 를 부르면 Next 14.2 의 ISR 캐시가 리다이렉트를 저장하면서
//   Location 헤더를 잃는다(실측: 1회차 308+Location, 2회차부터 308 에 Location 없음).
//   빌드 시 프리렌더해도 .meta 에 location 이 안 담긴다. noStore() 는 generateStaticParams 가 있는
//   라우트라 DYNAMIC_SERVER_USAGE 로 500. 미들웨어는 캐시 밖이라 이 문제가 없다.
//
// ⚠ 매핑 갱신: 새 자료를 등록하면 회차가 늘어난다. scripts/gen_exam_redirects.py 로 다시 굽고 배포할 것.
//   낡아도 해당 URL 이 200 으로 남을 뿐이라(현 상태와 동일) 잘못된 이동은 생기지 않는다.
const EXAM_REDIRECTS = new Map<string, string>(Object.entries(examRedirects as Record<string, string>))

export async function middleware(request: NextRequest) {
    const host = request.headers.get('host')

    // 비대표 시험지 URL → 같은 회차의 대표로 영구 이동 (캐시 밖이라 Location 이 보존된다)
    const examMatch = request.nextUrl.pathname.match(/^\/exam\/([0-9a-fA-F-]{36})\/?$/)
    if (examMatch) {
        const target = EXAM_REDIRECTS.get(examMatch[1])
        if (target && target !== examMatch[1]) {
            const url = request.nextUrl.clone()
            url.pathname = `/exam/${target}`
            // ⚠ 308 이 아니라 301 을 쓴다.
            //   308 은 표준이지만 네이버 Yeti 의 308 처리는 공개 문서가 빈약하고,
            //   308 을 리다이렉트 체인 오류나 색인 탈락으로 다룬 사례가 보고돼 있다.
            //   네이버가 우리 주력 유입 채널이라 보수적으로 간다. GET 만 쓰는 경로라 301 로 충분하다.
            //   (아래 www→apex 는 기존 308 을 그대로 둔다 — 이미 색인이 안정된 경로라 건드릴 이유가 없다)
            return NextResponse.redirect(url, 301)
        }
    }
    
    // www.mathetf.com으로 접속했을 때 mathetf.com으로 영구 리디렉션 (SEO 최적화)
    if (host === 'www.mathetf.com') {
        const url = request.nextUrl.clone()
        url.host = 'mathetf.com'
        url.protocol = 'https'
        return NextResponse.redirect(url, 308)
    }

    // 한글 URL(/모의고사…)은 next start에서 리터럴 한글 라우트 매칭이 깨지므로
    // 브라우저 URL은 한글로 유지하되 내부적으로 영문 라우트(/mock…)로 리라이트한다.
    let decoded = request.nextUrl.pathname
    try { decoded = decodeURIComponent(request.nextUrl.pathname) } catch { }
    if (decoded === '/모의고사' || decoded.startsWith('/모의고사/')) {
        const url = request.nextUrl.clone()
        url.pathname = '/mock' + decoded.slice('/모의고사'.length)
        return NextResponse.rewrite(url)
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
