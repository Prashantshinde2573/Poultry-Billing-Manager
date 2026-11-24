import type { Config } from 'tailwindcss';

/**
 * Design tokens taken from the reference: deep teal-black ink for primary
 * actions, aqua/mint accents on a soft mint-to-cream background, white glass
 * cards with large radii, pill tabs and round icon buttons.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0E2A2F', soft: '#334B50', muted: '#6B8187', faint: '#9DB0B4' },
        aqua: { DEFAULT: '#2BB5A8', light: '#5FD3C6', soft: '#E3F6F3', deep: '#16867C' },
        mint: '#EAF8F4',
        cream: '#FFFCF3',
        line: '#E1ECEA',
        good: '#1E9E6A',
        bad: '#E0533D',
        warn: '#D98A1C',
        violet: '#7C6CE0',
        sun: '#F2D45C',
        coral: '#F08A5D',
      },
      fontFamily: {
        sans: ['Outfit', 'Noto Sans Devanagari', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        card: '0 1px 2px rgba(14,42,47,0.04), 0 8px 24px -12px rgba(14,42,47,0.12)',
        float: '0 12px 32px -8px rgba(14,42,47,0.35)',
      },
    },
  },
  plugins: [],
} satisfies Config;
