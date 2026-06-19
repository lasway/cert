const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const puppeteer = require('puppeteer');

const db = require('./db');
const { renderCertificateHtml, certStyles } = require('./views/cert-template');

const app = express();
const PORT = process.env.PORT || 3000;
const VERIFY_PASSWORD = 'Gravity';
const CERT_QR_SIZE = 196;

const CERT_BG_PATH = path.join(__dirname, 'public', 'cert-bg.jpg');
const CERT_BG_DATA_URL = fs.existsSync(CERT_BG_PATH)
  ? 'data:image/jpeg;base64,' + fs.readFileSync(CERT_BG_PATH).toString('base64')
  : '';
const CERT_FONT_PATH = path.join(__dirname, 'public', 'fonts', 'Satoshi-Variable.woff2');
const CERT_FONT_DATA_URL = fs.existsSync(CERT_FONT_PATH)
  ? 'data:font/woff2;base64,' + fs.readFileSync(CERT_FONT_PATH).toString('base64')
  : '';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: 'gravity-learning-center-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 },
}));
app.use(express.static(path.join(__dirname, 'public')));

let _browser = null;
async function getBrowser() {
  if (!_browser) {
    _browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return _browser;
}

function credentialPathFor(certOrId) {
  const id = typeof certOrId === 'string' ? certOrId : certOrId.id;
  return `/${encodeURIComponent(id)}`;
}

function verifyUrlFor(cert) {
  const base = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
  return `${base}${credentialPathFor(cert)}`;
}

async function buildCertHtmlForPdf(cert) {
  const qrDataUrl = await QRCode.toDataURL(verifyUrlFor(cert), { margin: 0, width: CERT_QR_SIZE });
  const inner = renderCertificateHtml(cert, qrDataUrl, CERT_BG_DATA_URL);
  return `<!DOCTYPE html>
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
</style>
</head><body>${inner}</body></html>`;
}

async function renderCertPdf(cert) {
  const html = await buildCertHtmlForPdf(cert);
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
    preferCSSPageSize: true,
  });
  await page.close();
  return pdf;
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.redirect('/admin/login');
}

app.get('/', (req, res) => {
  res.redirect('/admin/login');
});

async function handleCredentialPage(req, res) {
  const { id } = req.params;
  const cert = db.getCertificate(id);
  if (!cert) {
    return res.status(404).send(renderPasswordPage({ id, error: 'Certificate not found.', notFound: true }));
  }
  const unlocked = req.session.unlockedCerts && req.session.unlockedCerts[id];
  if (!unlocked) {
    return res.send(renderPasswordPage({ id }));
  }
  const qrDataUrl = await QRCode.toDataURL(verifyUrlFor(cert), { margin: 0, width: CERT_QR_SIZE });
  res.send(renderVerifyPage(cert, qrDataUrl));
}

function handleCredentialUnlock(req, res) {
  const { id } = req.params;
  const password = req.body.p || req.body.password;
  const cert = db.getCertificate(id);
  if (!cert) {
    return res.status(404).send(renderPasswordPage({ id, error: 'Certificate not found.', notFound: true }));
  }
  if (password !== VERIFY_PASSWORD) {
    return res.status(401).send(renderPasswordPage({ id, error: 'Incorrect password.' }));
  }
  req.session.unlockedCerts = req.session.unlockedCerts || {};
  req.session.unlockedCerts[id] = true;
  res.redirect(credentialPathFor(id));
}

app.get('/verify/:id', (req, res) => {
  res.redirect(301, credentialPathFor(req.params.id));
});

app.post('/verify/:id', handleCredentialUnlock);

app.get('/admin/login', (req, res) => {
  if (req.session && req.session.admin) return res.redirect('/admin');
  res.send(renderLoginPage());
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (db.verifyAdmin(username, password)) {
    req.session.admin = username;
    return res.redirect('/admin');
  }
  res.status(401).send(renderLoginPage('Invalid credentials.'));
});

app.post('/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

app.get('/admin', requireAdmin, (req, res) => {
  const certs = db.listCertificates();
  res.send(renderDashboard(certs, req));
});

app.post('/admin/certificates', requireAdmin, (req, res) => {
  const { name, cert_type, granted_to, issue_date, revalidation_date } = req.body;
  if (!name || !cert_type) {
    return res.status(400).send('Name and certificate type are required');
  }
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const defaultIssue = `${yyyy}/${mm}/${dd}`;
  const reval = new Date(today.getFullYear() + 3, today.getMonth(), today.getDate());
  const defaultReval = `${reval.getFullYear()}/${String(reval.getMonth() + 1).padStart(2, '0')}/${String(reval.getDate()).padStart(2, '0')}`;

  const cert = db.createCertificate({
    name: name.trim().toUpperCase(),
    cert_type,
    granted_to: (granted_to || 'INFOAGE TECHNOLOGIES LTD').trim().toUpperCase(),
    issue_date: issue_date || defaultIssue,
    revalidation_date: revalidation_date || defaultReval,
  });
  res.redirect('/admin?created=' + cert.id);
});

app.post('/admin/certificates/:id/delete', requireAdmin, (req, res) => {
  db.deleteCertificate(req.params.id);
  res.redirect('/admin');
});

app.get('/admin/certificates/:id/pdf', requireAdmin, async (req, res) => {
  const cert = db.getCertificate(req.params.id);
  if (!cert) return res.status(404).send('Not found');
  try {
    const pdf = await renderCertPdf(cert);
    const safeName = cert.name.replace(/[^A-Z0-9]+/gi, '_');
    const suffix = cert.cert_type.includes('Rope Rigging') ? 'RR' : 'FABR';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName} - ${suffix}.pdf"`);
    res.end(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).send('PDF generation failed: ' + err.message);
  }
});

async function handleCredentialPdf(req, res) {
  const cert = db.getCertificate(req.params.id);
  if (!cert) return res.status(404).send('Not found');
  const unlocked = req.session.unlockedCerts && req.session.unlockedCerts[req.params.id];
  if (!unlocked) return res.status(401).send('Unlock the certificate first');
  try {
    const pdf = await renderCertPdf(cert);
    const safeName = cert.name.replace(/[^A-Z0-9]+/gi, '_');
    const suffix = cert.cert_type.includes('Rope Rigging') ? 'RR' : 'FABR';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName} - ${suffix}.pdf"`);
    res.end(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).send('PDF generation failed: ' + err.message);
  }
}

app.get('/verify/:id/pdf', handleCredentialPdf);
app.get('/:id/pdf', handleCredentialPdf);
app.get('/:id', handleCredentialPage);
app.post('/:id', handleCredentialUnlock);

function htmlShell(title, body, extraStyle = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #222; }
  .container { max-width: 1100px; margin: 0 auto; padding: 24px; }
  .btn { display: inline-block; padding: 10px 16px; background: #1f6feb; color: #fff; border-radius: 6px; border: 0; cursor: pointer; text-decoration: none; font-size: 14px; }
  .btn:hover { background: #1858c4; }
  .btn-danger { background: #c82333; }
  .btn-danger:hover { background: #a71d2a; }
  .btn-secondary { background: #6c757d; }
  .btn-secondary:hover { background: #5a6268; }
  input, select { padding: 10px; border: 1px solid #ccc; border-radius: 6px; width: 100%; box-sizing: border-box; font-size: 14px; }
  label { font-weight: 600; font-size: 13px; display: block; margin-bottom: 6px; }
  .field { margin-bottom: 14px; }
  .card { background: #fff; border: 1px solid #e3e3e3; border-radius: 10px; padding: 24px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
  .error { background: #ffe9e9; border: 1px solid #ffb4b4; padding: 10px 12px; border-radius: 6px; color: #8a1f1f; margin-bottom: 16px; font-size: 14px; }
  .ok { background: #e6f7ec; border: 1px solid #b4e3c5; padding: 10px 12px; border-radius: 6px; color: #1f6e3a; margin-bottom: 16px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 10px; border-bottom: 1px solid #eee; text-align: left; font-size: 13px; }
  th { background: #fafafa; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; background: #f0f0f0; padding: 2px 6px; border-radius: 4px; }
  ${extraStyle}
</style>
</head>
<body>${body}</body>
</html>`;
}

function renderPasswordPage({ id, error, notFound }) {
  const errorBlock = error ? `<div class="error-msg">${escapeHtml(error)}</div>` : '';
  const formAction = credentialPathFor(id);
  const inner = notFound ? `
    <h1>Certificate not found</h1>
    <p>The credential you are looking for does not exist.</p>
  ` : `
    <h1>Password Protected</h1>
    <p>Please enter the password created with this credential.</p>
    <input type="password" name="p" placeholder="securepass123" autofocus required>
    ${errorBlock}
    <br>
    <input type="submit" value="View credential">
  `;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width">
  <link rel="stylesheet" href="/globals.css">
  <title>Truvera Credentials</title>
  <style>html { -webkit-print-color-adjust: exact; }</style>
</head>
<body style="-webkit-print-color-adjust:exact;">
  <div class="password-wrapper">
    <form method="POST" action="${formAction}" class="password-form">
      <img src="/circle-bg.svg" class="circle-bg" alt="">
      <img src="/lock-icon.svg" class="lock-icon" alt="">
      ${inner}
    </form>
  </div>
</body>
</html>`;
  return html;
}

function renderVerifyPage(cert, qrDataUrl) {
  const certHtml = renderCertificateHtml(cert, qrDataUrl);
  const deeplink = `idwallet://?i_m=${Buffer.from(verifyUrlFor(cert)).toString('base64')}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width">
  <link rel="stylesheet" href="/globals.css">
  <title>Verifiable Credential</title>
  <style>
    html { -webkit-print-color-adjust: exact; }
    ${certStyles}
  </style>
</head>
<body style="-webkit-print-color-adjust:exact;">
  <div class="body-wrapper-padded">
    <div class="cred-wrapper">
      ${certHtml}
      <div class="dock-verified">
        <img src="/check.svg" alt="">
        Verified
        <span class="tooltip">
          We use Verifiable Credential technology. This attests that your credential is tamper-proof, cryptographically validated, and issued from a trusted entity.
        </span>
      </div>
      <a class="deeplink-btn" href="${deeplink}">
        <img src="/wallet-icon.svg" alt="ID Wallet" width="24px"> Import to Wallet
      </a>
    </div>
    <div class="cred-info-wrapper">
      <h2>Issued By</h2>
      <div class="cred-issuer-wrapper">
        <div>
          <h4>${escapeHtml(cert.issued_by)}</h4>
          <p title="${escapeHtml(cert.issued_by_did)}">${escapeHtml(cert.issued_by_did)}</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  return html;
}

function renderLoginPage(error) {
  const body = `
  <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px;">
    <div class="card" style="max-width:380px; width:100%;">
      <div style="text-align:center; margin-bottom: 16px;">
        <div style="font-family:'Arial Black', sans-serif; font-style:italic; color:#e11515; font-size:38px; font-weight:900; letter-spacing:2px;">GRAVITY</div>
        <div style="letter-spacing:6px; font-size:12px; color:#444;">LEARNING CENTER</div>
      </div>
      <h3 style="margin:0 0 16px;">Admin Login</h3>
      ${error ? `<div class="error">${error}</div>` : ''}
      <form method="POST" action="/admin/login">
        <div class="field"><label>Username</label><input type="text" name="username" autofocus required /></div>
        <div class="field"><label>Password</label><input type="password" name="password" required /></div>
        <button type="submit" class="btn" style="width:100%;">Login</button>
      </form>
      <div style="margin-top:14px; font-size:11px; color:#888;">Default: admin / admin123</div>
    </div>
  </div>`;
  return htmlShell('Admin Login', body);
}

function renderDashboard(certs, req) {
  const createdId = req.query.created;
  const createdCert = createdId ? certs.find(c => c.id === createdId) : null;

  const rows = certs.map(c => {
    const verifyPath = credentialPathFor(c);
    return `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.cert_type)}</td>
        <td><code>${escapeHtml(c.cert_no)}</code></td>
        <td>${escapeHtml(c.issue_date)}</td>
        <td>
          <a href="${verifyPath}" target="_blank" class="btn btn-secondary" style="padding:6px 10px; font-size:12px;">View</a>
          <a href="/admin/certificates/${c.id}/pdf" class="btn" style="padding:6px 10px; font-size:12px;">PDF</a>
          <form method="POST" action="/admin/certificates/${c.id}/delete" style="display:inline" onsubmit="return confirm('Delete this certificate?');">
            <button type="submit" class="btn btn-danger" style="padding:6px 10px; font-size:12px;">Delete</button>
          </form>
        </td>
      </tr>`;
  }).join('');

  const createdBanner = createdCert ? `
    <div class="ok">
      Certificate created. Verification URL:
      <div style="margin-top:6px;"><code id="vurl">${req.protocol}://${req.get('host')}${credentialPathFor(createdCert)}</code>
      <button type="button" class="btn btn-secondary" style="padding:4px 8px; font-size:12px; margin-left:8px;" onclick="navigator.clipboard.writeText(document.getElementById('vurl').textContent)">Copy</button></div>
      <div style="margin-top:6px; font-size:12px;">Password: <code>${VERIFY_PASSWORD}</code></div>
    </div>` : '';

  const body = `
  <div class="container">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
      <div>
        <div style="font-family:'Arial Black', sans-serif; font-style:italic; color:#e11515; font-size:28px; font-weight:900;">GRAVITY</div>
        <div style="letter-spacing:4px; font-size:11px; color:#666;">LEARNING CENTER &mdash; ADMIN</div>
      </div>
      <form method="POST" action="/admin/logout"><button type="submit" class="btn btn-secondary">Logout</button></form>
    </div>

    ${createdBanner}

    <div class="card" style="margin-bottom:24px;">
      <h3 style="margin-top:0;">Create Certificate</h3>
      <form method="POST" action="/admin/certificates">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px;">
          <div class="field">
            <label>Full Name</label>
            <input type="text" name="name" placeholder="e.g. RASHIDI JEURI" required />
          </div>
          <div class="field">
            <label>Granted To (Company)</label>
            <input type="text" name="granted_to" placeholder="INFOAGE TECHNOLOGIES LTD" value="INFOAGE TECHNOLOGIES LTD" />
          </div>
          <div class="field" style="grid-column: 1 / -1;">
            <label>Certificate Type</label>
            <select name="cert_type" required>
              <option value="Rope Rigging Technician (Int)">Rope Rigging Technician (Int) — Specific to loads of up to 100kg</option>
              <option value="Fall Arrest & Basic Rescue Technician (Int)">Fall Arrest &amp; Basic Rescue Technician (Int) — with Radio Frequency Awareness &amp; Gravity Vertical System User</option>
            </select>
          </div>
          <div class="field">
            <label>Issue Date (YYYY/MM/DD)</label>
            <input type="text" name="issue_date" placeholder="auto: today" />
          </div>
          <div class="field">
            <label>Revalidation Date (YYYY/MM/DD)</label>
            <input type="text" name="revalidation_date" placeholder="auto: +3 years" />
          </div>
        </div>
        <button type="submit" class="btn">Create Certificate</button>
      </form>
    </div>

    <div class="card">
      <h3 style="margin-top:0;">Certificates (${certs.length})</h3>
      <table>
        <thead>
          <tr><th>Name</th><th>Type</th><th>Cert No</th><th>Issued</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center; padding:24px; color:#888;">No certificates yet.</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;
  return htmlShell('Admin Dashboard', body);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin login: http://localhost:${PORT}/admin/login (admin / admin123)`);
});

process.on('SIGINT', async () => {
  if (_browser) await _browser.close();
  server.close(() => process.exit(0));
});
