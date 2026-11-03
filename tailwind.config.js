/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./app/index.html", "./app/js/**/*.js", "./assets/js/**/*.js"],
  // The site ships its own reset and page styles. Tailwind is here for the
  // utility + component layer only, so preflight stays off and nothing the
  // hand-written CSS already decides is re-decided.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        brand: "#008cff",
        "brand-hover": "#0b7bde",
        ink: "#16181c",
        "ink-2": "#3f444c",
        muted: "#767d87",
        faint: "#9aa0a9",
        line: "#ebedf0",
        "line-strong": "#dfe2e6",
        tint: "#f7f8fa",
        pill: "#f1f2f4",
        "pill-hover": "#e7e9ec",
        done: "#2fbf5b",
        "done-soft": "#e9f9ee",
        "done-ink": "#17793a",
        dark: "#0e1013",
        "dark-2": "#171a1f",
      },
      borderRadius: {
        sm: "8px",
        DEFAULT: "12px",
        lg: "16px",
        xl: "22px",
        pill: "999px",
        card: "16px",
        control: "12px",
      },
      fontFamily: {
        sans: ["Figtree", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        sm: ["13px", { lineHeight: "1.4" }],
        base: ["17px", { lineHeight: "1.6" }],
        lg: ["18px", { lineHeight: "1.6" }],
        xl: ["21px", { lineHeight: "1.4" }],
        "2xl": ["28px", { lineHeight: "1.12" }],
        "3xl": ["38px", { lineHeight: "1.1" }],
        "4xl": ["44px", { lineHeight: "1.08" }],
        "5xl": ["64px", { lineHeight: "1.03" }],
      },
      spacing: {
        0: "0px",
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        5: "20px",
        6: "24px",
        8: "32px",
        10: "40px",
        12: "48px",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "none" },
        },
        settle: {
          from: { opacity: "0", transform: "translateY(18px) scale(0.985)" },
          to: { opacity: "1", transform: "none" },
        },
        tick: {
          from: { strokeDashoffset: "22" },
          to: { strokeDashoffset: "0" },
        },
        count: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translate3d(0, 16px, 0)" },
          to: { opacity: "1", transform: "translate3d(0, 0, 0)" },
        },
        "fade-down": {
          from: { opacity: "0", transform: "translate3d(0, -14px, 0)" },
          to: { opacity: "1", transform: "translate3d(0, 0, 0)" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translate3d(-22px, 0, 0)" },
          to: { opacity: "1", transform: "translate3d(0, 0, 0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translate3d(22px, 0, 0)" },
          to: { opacity: "1", transform: "translate3d(0, 0, 0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.94)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        pop: {
          "0%": { opacity: "0", transform: "scale(0.86)" },
          "60%": { opacity: "1", transform: "scale(1.04)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translate3d(0, 0, 0) rotate(0deg)" },
          "50%": { transform: "translate3d(0, -9px, 0) rotate(-0.6deg)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translate3d(0, 0, 0)" },
          "50%": { transform: "translate3d(0, -16px, 0)" },
        },
        drift: {
          "0%, 100%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "33%": { transform: "translate3d(10px, -8px, 0) scale(1.03)" },
          "66%": { transform: "translate3d(-8px, 6px, 0) scale(0.98)" },
        },
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.9" },
          "50%": { transform: "scale(1.045)", opacity: "1" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.55" },
          "70%": { transform: "scale(1.35)", opacity: "0" },
          "100%": { transform: "scale(1.35)", opacity: "0" },
        },
        glow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(224, 90, 27, 0.28)" },
          "50%": { boxShadow: "0 0 0 10px rgba(224, 90, 27, 0)" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "25%": { transform: "rotate(-2.4deg)" },
          "75%": { transform: "rotate(2.4deg)" },
        },
        "bounce-soft": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        marquee: {
          from: { transform: "translate3d(0, 0, 0)" },
          to: { transform: "translate3d(-50%, 0, 0)" },
        },
        "draw-line": {
          from: { strokeDashoffset: "240" },
          to: { strokeDashoffset: "0" },
        },
        "blink-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        rise: "rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        settle: "settle 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        tick: "tick 0.45s ease-out both",
        count: "count 0.4s ease-out both",
        "fade-in": "fade-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-up": "fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-down": "fade-down 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-in-left": "slide-in-left 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-in-right": "slide-in-right 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
        "scale-in": "scale-in 0.42s cubic-bezier(0.22, 1, 0.36, 1) both",
        pop: "pop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        float: "float 6s ease-in-out infinite",
        "float-slow": "float-slow 9s ease-in-out infinite",
        drift: "drift 14s ease-in-out infinite",
        breathe: "breathe 4.5s ease-in-out infinite",
        shimmer: "shimmer 3.2s linear infinite",
        "pulse-ring": "pulse-ring 2.2s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        glow: "glow 2.6s ease-in-out infinite",
        wiggle: "wiggle 0.5s ease-in-out",
        "bounce-soft": "bounce-soft 2.4s ease-in-out infinite",
        "spin-slow": "spin-slow 18s linear infinite",
        marquee: "marquee 26s linear infinite",
        "draw-line": "draw-line 1.4s cubic-bezier(0.16, 1, 0.3, 1) both",
        "blink-soft": "blink-soft 2.4s ease-in-out infinite",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionDuration: {
        DEFAULT: "160ms",
        100: "100ms",
        200: "200ms",
        400: "400ms",
        700: "700ms",
      },
    },
  },
  plugins: [],
};
