import type { Config } from "tailwindcss";

/**
 * CREO — cinematic design tokens.
 * Warm cream canvas, a gold→orange→red sunset signature gradient (sampled from
 * the CREO logo), hairline glass.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Light "Sunset" surfaces (repurposed ink.* so existing utilities flip).
        ink: {
          950: "#ffffff",
          900: "#fff7ee",
          800: "#ffffff",
          700: "#ffe9d6",
          line: "rgba(0,0,0,0.08)",
        },
        // Brand accent, sampled from the CREO sunset mark (the warm band).
        pink: {
          DEFAULT: "#e0532a",
          soft: "#f4a15a",
          deep: "#b83f16",
        },
        // Legacy aliases kept warm so the theme stays cream/white/sunset.
        rose: {
          DEFAULT: "#e0532a",
          soft: "#f4a15a",
        },
        ember: {
          DEFAULT: "#ec8a3c",
          soft: "#f7b877",
        },
        // Cool accent, sampled from the top of the logo gradient.
        teal: {
          DEFAULT: "#6d94a0",
          soft: "#a9c6cd",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(224,83,42,0.35), 0 20px 60px -20px rgba(224,83,42,0.5)",
        card: "0 30px 80px -40px rgba(0,0,0,0.95)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "glow-pulse": {
          "0%,100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.16,1,0.3,1) both",
        "glow-pulse": "glow-pulse 4s ease-in-out infinite",
        marquee: "marquee 32s linear infinite",
        shimmer: "shimmer 2.2s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
