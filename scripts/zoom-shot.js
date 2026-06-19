const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const certId = process.argv[2];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1700, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:3000/${certId}`, { waitUntil: 'networkidle0' });
  await page.type('input[name="p"]', 'Gravity');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('input[type="submit"]'),
  ]);
  await page.screenshot({ path: path.join(__dirname, 'out', 'verify-page-zoom.png'), fullPage: true });
  console.log('saved verify-page-zoom.png');
  await browser.close();
})();
