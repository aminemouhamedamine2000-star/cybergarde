/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#02060b',
          900: '#040a12',
          850: '#06101a',
          800: '#081522',
          700: '#0d1f2f',
        },
        cyber: {
          cyan: '#22d3ee',
          sky: '#38bdf8',
          green: '#4ade80',
          mint: '#2dd4bf',
          amber: '#fbbf24',
          rose: '#fb7185',
        },
      },
      fontFamily: {
        sans: ['Tajawal', 'Cairo', 'Segoe UI', 'sans-serif'],
        display: ['Cairo', 'Tajawal', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-cyan': '0 0 32px rgba(34, 211, 238, 0.15), 0 0 0 1px rgba(34, 211, 238, 0.06)',
        'glow-green': '0 0 24px rgba(74, 222, 128, 0.14), 0 0 0 1px rgba(74, 222, 128, 0.06)',
        'glow-amber': '0 0 24px rgba(251, 191, 36, 0.13), 0 0 0 1px rgba(251, 191, 36, 0.06)',
        panel: '0 24px 70px -28px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.035)',
      },
      backgroundImage: {
        'cyber-grid':
          'linear-gradient(rgba(34, 211, 238, 0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 211, 238, 0.035) 1px, transparent 1px)',
        'panel-sheen':
          'linear-gradient(145deg, rgba(11, 27, 42, 0.94) 0%, rgba(5, 14, 24, 0.88) 55%, rgba(4, 10, 18, 0.96) 100%)',
      },
      backgroundSize: {
        grid: '44px 44px',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.9)', opacity: '0' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '15%': { opacity: '0.6' },
          '85%': { opacity: '0.2' },
          '100%': { transform: 'translateY(850%)', opacity: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-7px)' },
        },
        'glow-breathe': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        scan: 'scan 7s linear infinite',
        float: 'float 6s ease-in-out infinite',
        'glow-breathe': 'glow-breathe 3.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
