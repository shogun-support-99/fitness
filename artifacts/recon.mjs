import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-setuid-sandbox",
    "--no-zygote",
    "--single-process",
  ],
});
console.log("browser launched OK");

const page = await browser.newPage();
page.on("crash", () => console.log("PAGE CRASHED"));
page.on("close", () => console.log("PAGE CLOSED unexpectedly"));

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push("PAGEERROR: " + err.message));

console.log("=== LANDING PAGE ===");
await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
console.log("landing title:", await page.title());
console.log("landing body chars:", (await page.innerText("body")).length);

console.log("\n=== APP SHELL ===");
await page.goto("http://127.0.0.1:3000/app/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
console.log("app body chars:", (await page.innerText("body")).length);

console.log("\n=== CONSOLE ERRORS ===");
console.log(consoleErrors.length ? consoleErrors.join("\n") : "(none)");

await page.screenshot({ path: "artifacts/app.png" });
console.log("\n[screenshot saved artifacts/app.png]");
await browser.close();
