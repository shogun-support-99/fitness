import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/workspace/homes/45a7307e9e2bbe4270e9fce3/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox']
});

const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => { errors.push(err.message); });

try {
  await page.goto('http://127.0.0.1:3000/app/#/library', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  await page.screenshot({ path: 'artifacts/library_debug.png', fullPage: true });
  
  const rows = await page.locator('.library-row').count();
  console.log('library-row count:', rows);
  
  const cards = await page.locator('.exercise-card').count();
  console.log('exercise-card count:', cards);
  
  const anyLi = await page.locator('ul li').count();
  console.log('ul li count:', anyLi);
  
  const content = await page.content();
  console.log('Has "Exercises":', content.includes('Exercises'));
  console.log('Has "loading catalogue":', content.includes('loading catalogue'));
  
  console.log('\nErrors:', errors);
} catch (e) {
  console.log('ERR:', e.message);
} finally {
  await browser.close();
}
