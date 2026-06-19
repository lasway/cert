const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const certId = process.argv[2];
  if (!certId) {
    console.error('Usage: node screenshot.js <cert-id>');
    process.exit(1);
  }
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 1100, deviceScaleFactor: 1 });

  // Step 1: GET the password page to establish session
  await page.goto(`http://localhost:3000/${certId}`, { waitUntil: 'networkidle0' });
  // Step 2: fill the password and submit
  await page.type('input[name="p"]', 'Gravity');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('input[type="submit"]'),
  ]);

  const outDir = path.join(__dirname, 'out');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  await page.screenshot({ path: path.join(outDir, 'verify-page.png'), fullPage: true });
  console.log('Saved verify-page.png');

  // Focused screenshot of just the cert card
  const certEl = await page.$('.cert-card');
  if (certEl) {
    await certEl.screenshot({ path: path.join(outDir, 'cert-only.png') });
    console.log('Saved cert-only.png');
  }

  // Now also screenshot the password page (clean session via incognito context)
  const ctx = await browser.createBrowserContext();
  const page2 = await ctx.newPage();
  await page2.setViewport({ width: 1366, height: 1100, deviceScaleFactor: 1 });
  await page2.goto(`http://localhost:3000/${certId}`, { waitUntil: 'networkidle0' });
  await page2.screenshot({ path: path.join(outDir, 'password-page.png'), fullPage: true });
  console.log('Saved password-page.png');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
