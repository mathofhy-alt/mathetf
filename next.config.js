/** @type {import('next').NextConfig} */
// Force Rebuild: Optimized Image Resize Logic Active
const nextConfig = {
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    experimental: {
        // [PERF] lucide-react 아이콘을 사용한 것만 번들에 포함 (tree-shaking 보강)
        optimizePackageImports: ['lucide-react'],
    },
};

module.exports = nextConfig;
