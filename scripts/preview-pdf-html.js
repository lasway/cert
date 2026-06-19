const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const db = require('../db');
const { renderCertificateHtml, certStyles } = require('../views/cert-template');

const CERT_QR_SIZE = 196;
const CERT_BG_PATH = path.join(__dirname, '..', 'public', 'cert-bg.jpg');
const CERT_BG_DATA_URL = 'data:image/jpeg;base64,' + fs.readFileSync(CERT_BG_PATH).toString('base64');
const CERT_FONT_PATH = path.join(__dirname, '..', 'public', 'fonts', 'Satoshi-Variable.woff2');
const CERT_FONT_DATA_URL = fs.existsSync(CERT_FONT_PATH)
  ? 'data:font/woff2;base64,' + fs.readFileSync(CERT_FONT_PATH).toString('base64')
  : '';

(async () => {
  const certId = process.argv[2];
  const cert = db.getCertificate(certId);
  if (!cert) { console.error('Cert not found'); process.exit(1); }

  const qrDataUrl = await QRCode.toDataURL(`http://localhost:3000/${cert.id}`, { margin: 0, width: CERT_QR_SIZE });
  const inner = renderCertificateHtml(cert, qrDataUrl, CERT_BG_DATA_URL);

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page { size: 210mm 297mm; margin: 0; padding: 0; }
  ${CERT_FONT_DATA_URL ? `@font-face {
    font-family: 'Satoshi-Variable';
    src: url('${CERT_FONT_DATA_URL}') format('woff2');
    font-weight: 300 900;
    font-display: swap;
    font-style: normal;
  }` : ''}
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body { font-family: 'Satoshi-Variable', Arial, sans-serif; }
  ${certStyles}
  .prettyvc-renderer {
    position: fixed;
    left: 0;
    top: 0;
  }
  .prettyvc-scale-auto {
    font-size: 11.2252px !important;
  }
</style></head><body>${inner}</body></html>`;

  fs.writeFileSync(path.join(__dirname, 'out', 'pdf-html.html'), html);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1.5 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.screenshot({ path: path.join(__dirname, 'out', 'pdf-preview.png'), fullPage: true });
  console.log('Saved pdf-preview.png');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
