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
        line: "#ebedf0",
        tint: "#f7f8fa",
        done: "#2fbf5b",
      },
      borderRadius: {
        card: "16px",
        control: "12px",
      },
      fontFamily: {
        sans: ["Figtree", "ui-sans-serif", "system-ui", "sans-serif"],
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
    },
  },
  plugins: [],
};
