import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/workspace/homes/45a7307e9e2bbe4270e9fce3/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox']
});

const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push('C:' + msg.text()); });
page.on('pageerror', err => { errors.push('E:' + err.message); });
page.on('requestfailed', req => { errors.push('R:' + req.url()); });

try {
  await page.goto('http://127.0.0.1:3000/app/#/home', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // Try to start empty workout
  console.log('=== Starting workout ===');
  const startBtn = page.locator('button:has-text("Start empty workout")').first();
  if (await startBtn.count() > 0) {
    await startBtn.click();
    await page.waitForTimeout(2000);
    console.log('Clicked start workout, URL:', page.url());
    await page.screenshot({ path: 'artifacts/workout_started.png', fullPage: true });
    
    // Try to add exercise
    const addBtn = page.locator('button:has-text("Add exercise")').first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(2000);
      console.log('Opened picker');
      await page.screenshot({ path: 'artifacts/picker.png', fullPage: true });
      
      // Try to select first exercise
      const firstEx = page.locator('.picker-list button, .picker-item').first();
      if (await firstEx.count() > 0) {
        await firstEx.click();
        await page.waitForTimeout(2000);
        console.log('Selected exercise');
        await page.screenshot({ path: 'artifacts/after_add_exercise.png', fullPage: true });
      }
    }
  } else {
    console.log('Start button not found');
  }
  
  console.log('\n=== ERRORS ===');
  errors.forEach(e => console.log(e));
  if (errors.length === 0) console.log('None');
  
} catch (e) {
  console.log('ERR:', e.message);
} finally {
  await browser.close();
}
