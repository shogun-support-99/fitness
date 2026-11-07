/**
 * Runs before first paint: mark JavaScript as available and enable the
 * authored motion styles. Kept in an external file so the page can ship a
 * strict `script-src 'self'` policy with no inline-script exception.
 */
document.documentElement.classList.remove("no-js");
document.documentElement.classList.add("js", "motion-ok");
