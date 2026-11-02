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
        line-strong: "#dfe2e6",
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
      },
      animation: {
        rise: "rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        settle: "settle 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        tick: "tick 0.45s ease-out both",
        count: "count 0.4s ease-out both",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      transitionDuration: {
        DEFAULT: "160ms",
        100: "100ms",
        200: "200ms",
      },
    },
  },
  plugins: [],
};
