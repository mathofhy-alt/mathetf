import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['var(--font-noto)', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Roboto', '"Helvetica Neue"', '"Segoe UI"', '"Apple SD Gothic Neo"', '"Noto Sans KR"', '"Malgun Gothic"', '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', 'sans-serif'],
            },
            colors: {
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                // Pantone 2026 Atmospheric Palette
                brand: {
                    50:  '#EEF4FB',
                    100: '#DCE9F7',
                    200: '#B7D1EA', // Nantucket Breeze
                    300: '#8DB8DC',
                    400: '#6399CA',
                    500: '#5B8EC4',
                    600: '#497AB7', // Regatta ← Primary
                    700: '#3A6599',
                    800: '#2C517A',
                    900: '#1E2D4F', // Deep Navy
                },
                rivulet: '#5CC6C3', // Rinsing Rivulet (teal)
                cosmic:  '#AAAAC4', // Cosmic Sky (muted purple-gray)
                cloud:   '#F2F3F0', // Cloud Dancer (off-white base)
                accent: {
                    red: '#e11d48',
                    yellow: '#fbbf24',
                }
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out',
                'slide-up': 'slideUp 0.5s ease-out',
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
            },
        },
    },
    plugins: [],
};
export default config;
