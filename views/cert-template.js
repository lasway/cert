function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getSubTextLines(cert_type) {
  if (cert_type === 'Rope Rigging Technician (Int)') {
    return ['Specific to loads of up to 100kg'];
  }
  if (cert_type === 'Fall Arrest & Basic Rescue Technician (Int)') {
    return ['with Radio Frequency Awareness', 'with Gravity Vertical System User'];
  }
  return [];
}

function renderLayer(className, html) {
  return `
  <div class="pv-layer ${className}">
    <div class="pv-frame">
      ${html}
      <div></div>
    </div>
  </div>`;
}

function textBox(className, html) {
  return renderLayer(className, `<div class="pv-text">${html}</div>`);
}

function splitCertificateNumber(certNo) {
  const value = String(certNo || '');
  if (value.startsWith('GT')) {
    return { prefix: 'Certificate No: GT', suffix: value.slice(2) };
  }
  return { prefix: 'Certificate No: ', suffix: value };
}

function renderCertificateHtml(cert, qrDataUrl, bgImageUrl = '/cert-bg.jpg') {
  const subLines = getSubTextLines(cert.cert_type);
  const certNo = splitCertificateNumber(cert.cert_no);
  const subHtml = subLines.map((line, index) =>
    textBox(`pv-subline pv-subline-${index + 1}`, escapeHtml(line))
  ).join('');

  return `
<div class="prettyvc-renderer prettyvc-a4-portrait prettyvc-scale-auto cert-card">
  <div class="pv-background" style="background-image:url('${bgImageUrl}');"></div>

  ${textBox('pv-cert-no', `<span>${escapeHtml(certNo.prefix)}</span><b>${escapeHtml(certNo.suffix)}</b>`)}
  ${textBox('pv-granted', `<b>Hereby granted to ${escapeHtml(cert.granted_to)}</b>`)}
  ${textBox('pv-certify-label', 'This is to certify that:')}
  ${textBox('pv-name', `<b>${escapeHtml(cert.name)}</b>`)}
  ${textBox('pv-id-label', 'ID Number:')}
  ${textBox('pv-id-number', `<b>${escapeHtml(cert.id_number)}</b>`)}
  ${textBox('pv-assessed-label', 'Has been successfully assessed as a')}
  ${textBox('pv-cert-type', `<b>${escapeHtml(cert.cert_type)}</b>`)}
  ${subHtml}
  ${textBox('pv-registrar', '<b>Registrar</b>')}
  ${textBox('pv-issue-date', escapeHtml(cert.issue_date))}
  ${textBox('pv-issue-label', '<b>Date of Issue</b>')}
  ${textBox('pv-reval-date', escapeHtml(cert.revalidation_date))}
  ${textBox('pv-reval-label', '<b>Revalidation Date</b>')}

  <div class="pv-layer pv-qr">
    <div class="pv-frame">
      <div class="pv-qr-box"><img src="${qrDataUrl}" alt="Scan QR"></div>
      <div></div>
    </div>
  </div>
</div>`;
}

const certStyles = `
  .prettyvc-renderer {
    position: relative;
    overflow: hidden;
  }

  .prettyvc-scale-auto,
  .prettyvc-scale-800 {
    font-size: 8px;
  }

  .prettyvc-a4-portrait {
    height: 100em;
    width: 70.7070707em;
  }

  .cert-card {
    background: #fff;
    color: #000;
    font-family: 'Satoshi-Variable', Arial, Helvetica, sans-serif;
  }

  .cert-card,
  .cert-card * {
    box-sizing: border-box;
  }

  .pv-background {
    color: #fff;
    font-weight: 400;
    text-align: left;
    font-size: 2.5em;
    overflow-wrap: break-word;
    width: 100%;
    height: 100%;
    position: absolute;
    background-color: #fff;
    z-index: 0;
    left: 0;
    top: 0;
    background-size: 100% 100%;
    background-position: left top;
    background-repeat: no-repeat;
  }

  .pv-layer {
    position: absolute;
    opacity: 1;
    z-index: 1;
  }

  .pv-frame {
    position: relative;
    user-select: auto;
    width: 100%;
    height: 100%;
    min-width: 20px;
    min-height: 20px;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .pv-text {
    color: #000;
    font-weight: 400;
    overflow-wrap: break-word;
    width: 100%;
    height: 100%;
  }

  .pv-text b,
  .pv-text span {
    font-weight: 700;
  }

  .pv-cert-no {
    left: 65.3518%;
    top: 4%;
    width: 34.6504%;
    height: 5%;
  }
  .pv-cert-no .pv-text {
    text-align: left;
    font-size: 1.25em;
  }
  .pv-cert-no span {
    text-align: right;
  }

  .pv-granted {
    left: 10.9299%;
    top: 21.625%;
    width: 78.1402%;
    height: 5%;
  }
  .pv-granted .pv-text {
    text-align: center;
    font-size: 1.75em;
  }

  .pv-certify-label {
    left: 19.3273%;
    top: 29.625%;
    width: 61.3454%;
    height: 5%;
  }
  .pv-certify-label .pv-text,
  .pv-id-label .pv-text,
  .pv-assessed-label .pv-text {
    text-align: center;
    font-size: 1.75em;
  }

  .pv-name {
    left: 4.30119%;
    top: 32.125%;
    width: 91.3993%;
    height: 5%;
  }
  .pv-name .pv-text,
  .pv-id-number .pv-text,
  .pv-cert-type .pv-text {
    text-align: center;
    font-size: 2.25em;
  }

  .pv-id-label {
    left: 39.6579%;
    top: 40%;
    width: 20.6843%;
    height: 5%;
  }

  .pv-id-number {
    left: 12.8746%;
    top: 42.25%;
    width: 74.2509%;
    height: 5%;
  }

  .pv-assessed-label {
    left: 23.0398%;
    top: 48.6875%;
    width: 53.9205%;
    height: 5%;
  }

  .pv-cert-type {
    left: 7.83722%;
    top: 50.625%;
    width: 84.3256%;
    height: 5%;
  }

  .pv-subline .pv-text {
    color: rgb(150, 150, 150);
    text-align: center;
    font-size: 1.75em;
  }
  .pv-subline-1 {
    left: 4.21197%;
    top: 53.875%;
    width: 91.5761%;
    height: 5%;
  }
  .pv-subline-2 {
    left: 3.06396%;
    top: 56.5%;
    width: 93.8743%;
    height: 5%;
  }

  .pv-registrar {
    left: 7.07154%;
    top: 69.875%;
    width: 12.552%;
    height: 5%;
  }
  .pv-registrar .pv-text {
    text-align: center;
    font-size: 1.5em;
  }

  .pv-issue-date {
    left: 73.7188%;
    top: 61.5%;
    width: 22.0984%;
    height: 5%;
  }
  .pv-reval-date {
    left: 73.7205%;
    top: 67.625%;
    width: 22.2751%;
    height: 5%;
  }
  .pv-issue-date .pv-text,
  .pv-reval-date .pv-text {
    text-align: left;
    font-size: 1.375em;
  }

  .pv-issue-label {
    left: 73.7205%;
    top: 63.375%;
    width: 19.4467%;
    height: 5%;
  }
  .pv-reval-label {
    left: 73.7205%;
    top: 69.375%;
    width: 26.3414%;
    height: 5%;
  }
  .pv-issue-label .pv-text,
  .pv-reval-label .pv-text {
    text-align: left;
    font-size: 1.5em;
  }

  .pv-qr {
    left: 69.4776%;
    top: 71.75%;
    width: 25.6342%;
    height: 18.625%;
  }
  .pv-qr-box {
    width: 100%;
    height: 100%;
    background: #fff;
    padding: 0.5em;
  }
  .pv-qr-box img {
    width: 100%;
    display: block;
  }
`;

module.exports = { renderCertificateHtml, certStyles, getSubTextLines };
