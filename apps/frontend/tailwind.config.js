/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        display: ['"Syne"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        lumen: {
          void: "#030304",
          ink: "#070708",
          panel: "#0c0c0f",
          lift: "#141419",
          line: "#2a2a33",
          mist: "#a1a1aa",
          signal: "#22d3ee",
          signalDim: "#0891b2",
          heat: "#f43f5e",
          heatGlow: "#fb7185",
          ok: "#4ade80",
          warn: "#fbbf24",
          paper: "#f0ece4",
          canvas: "#faf8f4",
        },
      },
      boxShadow: {
        glow: "0 0 40px -10px rgba(139, 92, 246, 0.45)",
        "glow-cyan": "0 0 36px -8px rgba(34, 211, 238, 0.35)",
        panel: "0 24px 48px -12px rgba(15, 23, 42, 0.12)",
        "panel-dark": "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        signal: "0 0 24px -4px rgba(34, 211, 238, 0.35)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.94)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-up-slow": "fade-up 0.75s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scale-in": "scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "slide-in-right": "slide-in-right 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        float: "float 5s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};
