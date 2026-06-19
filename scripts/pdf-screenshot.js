const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 1 });
  const pdfPath = path.resolve('scripts/out/cert.pdf').split(path.sep).join('/');
  const url = 'file:///' + pdfPath;
  console.log('Loading:', url);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'scripts/out/pdf-render.png', fullPage: true });
  console.log('Saved pdf-render.png');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
