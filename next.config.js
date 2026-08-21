/** @type {import('next').NextConfig} */
// Force Rebuild: Optimized Image Resize Logic Active
const nextConfig = {
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    // 정적 생성 타임아웃 (기본 60초 → 180초).
    // /teacher 는 questions 의 exact count 를 도는데, DB 가 콜드일 때 이 쿼리 하나가
    // 43초 넘게 걸린다(2026-08-21 측정). 빌드 워커가 동시에 몰리면 60초를 넘겨
    // "Static page generation for /teacher is still timing out" 으로 빌드가 통째로 죽는다.
    staticPageGenerationTimeout: 180,
    experimental: {
        // [PERF] lucide-react 아이콘을 사용한 것만 번들에 포함 (tree-shaking 보강)
        optimizePackageImports: ['lucide-react'],
    },
};

module.exports = nextConfig;
