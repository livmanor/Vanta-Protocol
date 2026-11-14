/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        page: '#F8FAFC',
        surface: '#FFFFFF',
        border: '#E2E8F0',
        primary: '#0F172A',
        secondary: '#475569',
        tertiary: '#64748B',
        brand: {
          DEFAULT: '#4338CA',
          hover: '#3730A3',
          subtle: '#EEF2FF',
        },
        risk: {
          green: '#16A34A',
          'green-subtle': '#DCFCE7',
          amber: '#D97706',
          'amber-subtle': '#FEF3C7',
          red: '#DC2626',
          'red-subtle': '#FEE2E2',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        md: '6px',
        lg: '6px',
        xl: '6px',
        '2xl': '6px',
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        6: '24px',
        8: '32px',
        12: '48px',
      },
    },
  },
  plugins: [],
}
