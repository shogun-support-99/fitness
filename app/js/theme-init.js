/**
 * Apply the saved appearance before first paint. Light is the crafted
 * default; a saved dark preference wins.
 *
 * External rather than inline so both pages can enforce `script-src 'self'`
 * without an inline-script hash to maintain.
 */
try {
  const saved = JSON.parse(localStorage.getItem("ironlog.v1") || "null");
  const theme = saved?.settings?.theme || "light";
  if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
  }
} catch {
  document.documentElement.dataset.theme = "light";
}
