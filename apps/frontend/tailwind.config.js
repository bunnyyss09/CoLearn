import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        accent: {
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
        },
        signal: {
          cyan: '#22d3ee',
          mint: '#34d399',
          amber: '#fbbf24',
          rose: '#fb7185',
        },
        neon: {
          blue: '#00f0ff',
          purple: '#bf5af2',
          pink: '#ff2d55',
          green: '#30d158',
          orange: '#ff9f0a',
        },
        surface: {
          50: '#faf8ff',
          100: '#f3f0ff',
          200: '#e8e3f8',
          300: '#d9d2eb',
          600: '#3a315f',
          700: '#251d45',
          800: '#1a1333',
          900: '#0f0a1e',
          950: '#070411',
        },
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', ...defaultTheme.fontFamily.mono],
      },
      boxShadow: {
        'glow-brand': '0 0 20px rgba(139, 92, 246, 0.3), 0 0 60px rgba(139, 92, 246, 0.1)',
        'glow-accent': '0 0 20px rgba(20, 184, 166, 0.3), 0 0 60px rgba(20, 184, 166, 0.1)',
        'glow-cyan': '0 0 24px rgba(34, 211, 238, 0.28), 0 0 80px rgba(52, 211, 153, 0.12)',
        'glow-neon': '0 0 15px rgba(0, 240, 255, 0.4), 0 0 45px rgba(0, 240, 255, 0.15), 0 0 90px rgba(0, 240, 255, 0.05)',
        'glow-purple': '0 0 15px rgba(191, 90, 242, 0.4), 0 0 45px rgba(191, 90, 242, 0.15)',
        'elevated-dark': '0 24px 70px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        'elevated-light': '0 22px 55px rgba(43, 35, 95, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.85)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 10px 15px -3px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 20px 40px -10px rgba(0, 0, 0, 0.08)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 rgba(0, 0, 0, 0.2)',
        'glass-light': '0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 rgba(0, 0, 0, 0.04)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '33%': { transform: 'translateY(-20px) rotate(2deg)' },
          '66%': { transform: 'translateY(10px) rotate(-1deg)' },
        },
        'float-delayed': {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '33%': { transform: 'translateY(15px) rotate(-2deg)' },
          '66%': { transform: 'translateY(-25px) rotate(1deg)' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.7' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        aurora: {
          '0%': { backgroundPosition: '0% 50%', transform: 'rotate(0deg) scale(1)' },
          '25%': { backgroundPosition: '50% 0%', transform: 'rotate(1deg) scale(1.02)' },
          '50%': { backgroundPosition: '100% 50%', transform: 'rotate(0deg) scale(1)' },
          '75%': { backgroundPosition: '50% 100%', transform: 'rotate(-1deg) scale(1.02)' },
          '100%': { backgroundPosition: '0% 50%', transform: 'rotate(0deg) scale(1)' },
        },
        'morph-blob': {
          '0%, 100%': { borderRadius: '42% 58% 70% 30% / 45% 45% 55% 55%' },
          '34%': { borderRadius: '70% 30% 46% 54% / 30% 58% 42% 70%' },
          '67%': { borderRadius: '28% 72% 44% 56% / 64% 28% 72% 36%' },
        },
        'holo-rotate': {
          '0%': { '--holo-angle': '0deg' },
          '100%': { '--holo-angle': '360deg' },
        },
        'border-flow': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'breathe': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.7' },
          '50%': { transform: 'scale(1.05)', opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'ripple': {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        'text-shimmer': {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        'orb-float-1': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '25%': { transform: 'translate(80px, -60px) scale(1.1)' },
          '50%': { transform: 'translate(-40px, -120px) scale(0.95)' },
          '75%': { transform: 'translate(60px, -40px) scale(1.05)' },
        },
        'orb-float-2': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '25%': { transform: 'translate(-100px, 50px) scale(1.15)' },
          '50%': { transform: 'translate(60px, 100px) scale(0.9)' },
          '75%': { transform: 'translate(-80px, -30px) scale(1.05)' },
        },
        'particle-float': {
          '0%, 100%': { transform: 'translateY(0) translateX(0)', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { transform: 'translateY(-100vh) translateX(50px)', opacity: '0' },
        },
      },
      animation: {
        float: 'float 20s ease-in-out infinite',
        'float-delayed': 'float-delayed 25s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 8s ease infinite',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
        scan: 'scan 9s linear infinite',
        shimmer: 'shimmer 3s ease-in-out infinite',
        aurora: 'aurora 15s ease-in-out infinite',
        'morph-blob': 'morph-blob 12s ease-in-out infinite',
        'border-flow': 'border-flow 4s ease infinite',
        'breathe': 'breathe 4s ease-in-out infinite',
        'slide-in-right': 'slide-in-right 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'ripple': 'ripple 1s ease-out',
        'text-shimmer': 'text-shimmer 3s ease-in-out infinite',
        'orb-1': 'orb-float-1 25s ease-in-out infinite',
        'orb-2': 'orb-float-2 30s ease-in-out infinite',
        'particle': 'particle-float 8s ease-in-out infinite',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #7c3aed, #22d3ee, #34d399)',
        'gradient-hero': 'linear-gradient(135deg, #070411 0%, #141028 36%, #092a33 100%)',
        'gradient-panel': 'linear-gradient(135deg, rgba(255,255,255,0.13), rgba(255,255,255,0.04))',
        'gradient-aurora': 'linear-gradient(135deg, #00f0ff, #bf5af2, #ff2d55, #00f0ff)',
        'gradient-holographic': 'linear-gradient(135deg, rgba(0,240,255,0.15), rgba(191,90,242,0.15), rgba(255,45,85,0.15), rgba(48,209,88,0.15))',
        'gradient-mesh': 'radial-gradient(at 40% 20%, rgba(0,240,255,0.12) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(191,90,242,0.12) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(48,209,88,0.08) 0px, transparent 50%), radial-gradient(at 80% 50%, rgba(255,45,85,0.08) 0px, transparent 50%), radial-gradient(at 0% 100%, rgba(0,240,255,0.08) 0px, transparent 50%)',
      },
      backdropBlur: {
        xs: '2px',
        '3xl': '64px',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
