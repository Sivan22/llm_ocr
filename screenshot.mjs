import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:5174/';
const OUT = process.env.OUT || '/tmp/screenshots';
const SUFFIX = process.env.SUFFIX || '';

const viewports = [
  { name: 'mobile-sm', width: 320, height: 700 },
  { name: 'mobile', width: 375, height: 800 },
  { name: 'mobile-lg', width: 480, height: 850 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'wide', width: 1920, height: 1080 },
];

const tabs = ['ocr', 'editor', 'export', 'jobs'];

const browser = await chromium.launch();
try {
  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    page.on('pageerror', (err) => console.warn('pageerror:', err.message));
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const triggers = page.locator('button[role="tab"]');
    const count = await triggers.count();
    for (let i = 0; i < Math.min(count, tabs.length); i++) {
      await triggers.nth(i).click().catch(() => {});
      await page.waitForTimeout(400);
      const filename = `${OUT}/${vp.name}_${tabs[i]}${SUFFIX}.png`;
      await page.screenshot({ path: filename, fullPage: true });
      console.log(`Saved ${filename}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
