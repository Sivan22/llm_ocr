import { chromium } from 'playwright';
import { readFile } from 'fs/promises';

const URL = process.env.URL || 'http://localhost:5174/';
const OUT = process.env.OUT || '/tmp/screenshots';
const PDF = process.env.PDF || '/tmp/v3-out.pdf';
const SUFFIX = process.env.SUFFIX || '_loaded';

const viewports = [
  { name: 'mobile-sm', width: 320, height: 700 },
  { name: 'mobile', width: 375, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
];

const tabs = ['ocr', 'editor', 'export', 'jobs'];

const pdfBytes = await readFile(PDF);

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
    await page.waitForTimeout(800);

    // Upload PDF via the hidden input
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'test.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBytes,
    });
    // Wait for processing
    await page.waitForTimeout(3500);

    const triggers = page.locator('button[role="tab"]');
    for (let i = 0; i < tabs.length; i++) {
      await triggers.nth(i).click().catch(() => {});
      await page.waitForTimeout(800);
      const filename = `${OUT}/${vp.name}_${tabs[i]}${SUFFIX}.png`;
      await page.screenshot({ path: filename, fullPage: true });
      console.log(`Saved ${filename}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
