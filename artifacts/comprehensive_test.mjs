import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/workspace/homes/45a7307e9e2bbe4270e9fce3/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox']
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 800 }
});
const page = await context.newPage();

const errors = [];
page.on('console', msg => {
  if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
});
page.on('pageerror', err => {
  errors.push('PAGEERR: ' + err.message);
});
page.on('requestfailed', req => {
  errors.push('REQFAIL: ' + req.url() + ' ' + req.failure()?.errorText);
});

try {
  // Landing page
  console.log('=== Testing landing page ===');
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log('Title:', await page.title());
  await page.screenshot({ path: 'artifacts/landing_test.png', fullPage: true });
  
  // Go to app
  console.log('\n=== Testing app ===');
  await page.goto('http://127.0.0.1:3000/app/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('App URL:', page.url());
  await page.screenshot({ path: 'artifacts/app_test.png', fullPage: true });
  
  // Check navigation
  console.log('\n=== Testing navigation ===');
  const navItems = ['Workout', 'Exercises', 'History', 'Profile', 'Settings'];
  for (const item of navItems) {
    try {
      const link = page.locator(`nav a:has-text("${item}"), [role="navigation"] a:has-text("${item}"), a:has-text("${item}")`).first();
      if (await link.count() > 0) {
        console.log(`Clicking ${item}...`);
        await link.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `artifacts/nav_${item.toLowerCase()}.png`, fullPage: true });
        console.log(`${item} loaded OK`);
      } else {
        console.log(`${item} not found`);
      }
    } catch (e) {
      console.log(`Error clicking ${item}:`, e.message);
    }
  }
  
  // Go back to home
  try {
    const homeLink = page.locator('nav a:has-text("Home"), a:has-text("Home")').first();
    if (await homeLink.count() > 0) {
      await homeLink.click();
      await page.waitForTimeout(1000);
    }
  } catch (e) {}
  
  // Check exercises page specifically
  console.log('\n=== Testing Exercises page ===');
  try {
    const exLink = page.locator('nav a:has-text("Exercises")').first();
    if (await exLink.count() > 0) {
      await exLink.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'artifacts/exercises_page.png', fullPage: true });
      
      // Check if exercises loaded
      const exCount = await page.locator('.exercise-item, [data-exercise], .exercise-card').count();
      console.log(`Exercise items found: ${exCount}`);
      
      // Check for errors in exercise loading
    }
  } catch (e) {
    console.log('Exercises page error:', e.message);
  }
  
  console.log('\n=== ALL ERRORS ===');
  if (errors.length === 0) {
    console.log('No errors found!');
  } else {
    errors.forEach(e => console.log(e));
  }
  
} catch (e) {
  console.log('FATAL ERROR:', e.message);
  errors.push('FATAL: ' + e.message);
} finally {
  await browser.close();
}
