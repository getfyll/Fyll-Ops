/* Fyll Free Tools: QR code generator. Uses the shared saved business details for sensible defaults. */
(function () {
  'use strict';
  var KEY = 'fyll-free-tools-v1';
  var shared = {};
  try { shared = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { shared = {}; }
  var QKEY = 'fyll-free-tools-qr-v1';
  var q;
  try { q = JSON.parse(localStorage.getItem(QKEY) || 'null'); } catch (e) { q = null; }
  q = Object.assign({
    type: 'link', url: shared.bizUrl || '', waPhone: shared.bizPhone || '', waMsg: 'Hi, I would like to place an order.',
    ig: '', bank: shared.bankName || '', acct: shared.acctNo || '', acctName: shared.acctName || '', amount: '',
    phone: shared.bizPhone || '', text: '', color: '#141414', style: 'rounded', caption: 'Scan to shop', useLogo: false
  }, q || {});
  if (q.caption === 'Scan for payment details') q.caption = 'Scan to pay';
  var save = function () { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) {} };

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var biz = (shared.bizName || '').trim();
  var CAPTIONS = { link: 'Scan to shop', whatsapp: 'Scan to chat on WhatsApp', instagram: 'Scan to follow us', payment: 'Scan to pay', call: 'Scan to call us', text: '' };

  var phoneIntl = function (p) {
    var d = String(p || '').replace(/\D+/g, '');
    if (!d) return '';
    if (d.indexOf('234') === 0) return d;
    if (d.charAt(0) === '0') return '234' + d.slice(1);
    return d.length === 10 ? '234' + d : d;
  };
  var withScheme = function (u) { u = String(u || '').trim(); if (!u) return ''; return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : 'https://' + u; };

  var payload = function () {
    switch (q.type) {
      case 'link': return withScheme(q.url);
      case 'whatsapp': { var n = phoneIntl(q.waPhone); if (!n) return ''; return 'https://wa.me/' + n + (q.waMsg.trim() ? '?text=' + encodeURIComponent(q.waMsg.trim()) : ''); }
      case 'instagram': { var h = String(q.ig || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, ''); return h ? 'https://instagram.com/' + h : ''; }
      case 'payment': {
        if (!q.acct.trim()) return '';
        var lines = ['Pay ' + (biz || q.acctName.trim() || 'us') + ' by bank transfer', 'Bank: ' + (q.bank.trim() || '-'), 'Account number: ' + q.acct.trim(), 'Account name: ' + (q.acctName.trim() || '-')];
        if (String(q.amount).trim()) lines.push('Amount: ₦' + Number(q.amount).toLocaleString('en-NG'));
        return lines.join('\n');
      }
      case 'call': { var c = phoneIntl(q.phone); return c ? 'tel:+' + c : ''; }
      default: return String(q.text || '').trim();
    }
  };

  var matrix = function (data, hiEc) {
    if (!window.qrcode) return null;
    window.qrcode.stringToBytes = function (s) { return Array.prototype.slice.call(new TextEncoder().encode(s)); };
    var qr = window.qrcode(0, hiEc ? 'H' : 'M');
    qr.addData(data, 'Byte'); qr.make();
    var n = qr.getModuleCount(), m = [];
    for (var r = 0; r < n; r++) { m.push([]); for (var c = 0; c < n; c++) m[r].push(qr.isDark(r, c)); }
    return m;
  };
  var isFinder = function (r, c, n) { return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7); };

  var logoImg = null;
  var loadLogo = function (cb) {
    if (!shared.logo) { logoImg = null; return cb(); }
    var im = new Image(); im.onload = function () { logoImg = im; cb(); }; im.onerror = function () { logoImg = null; cb(); }; im.src = shared.logo;
  };

  /* Bank-details QR: "Scan to pay" above the code; under it bank (small), account number (big), business name (small). */
  var isPayLayout = function () { return q.type === 'payment' && !!q.acct.trim(); };
  var detailLines = function () {
    if (!isPayLayout()) return [];
    var out = [];
    if (q.bank.trim()) out.push({ t: q.bank.trim(), size: 2.3, weight: 500, color: '#6b6e62' });
    out.push({ t: q.acct.trim(), size: 4.2, weight: 800, color: '#141414', spaced: true });
    var who = q.acctName.trim() || biz;
    if (who) out.push({ t: who, size: 2.3, weight: 500, color: '#6b6e62' });
    if (String(q.amount).trim()) out.push({ t: '₦' + Number(q.amount).toLocaleString('en-NG'), size: 2.6, weight: 700, color: '#141414' });
    return out;
  };
  var linesHeight = function (lines) { return lines.reduce(function (h, l) { return h + l.size * 1.45; }, 0); };
  var FONT = '"Public Sans", system-ui, sans-serif';

  /* draw QR (+ captions) onto a canvas of the given module pixel size */
  var draw = function (cv, m, px) {
    var n = m.length, quiet = 4, size = (n + quiet * 2) * px, o = quiet * px;
    var pay = isPayLayout(), cap = q.caption.trim();
    var det = detailLines();
    var topH = pay && cap ? Math.round(px * 6.5) : 0;
    var botCapH = !pay && cap ? Math.round(px * 7) + (biz ? Math.round(px * 4.2) : 0) + Math.round(px * 3) : 0;
    var detH = det.length ? Math.round(px * (1.5 + linesHeight(det) + 2)) : 0;
    cv.width = size; cv.height = topH + size + botCapH + detH;
    var x = cv.getContext('2d'), col = q.color;
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, cv.width, cv.height);
    var rr = function (X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); x.fill(); };
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    if (topH) {
      x.fillStyle = col; x.font = '800 ' + Math.round(px * 4) + 'px ' + FONT;
      x.fillText(cap, size / 2, Math.round(px * 5.6), size - o);
    }
    var oy = topH;
    x.fillStyle = col;
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (!m[r][c] || isFinder(r, c, n)) continue;
      var X = o + c * px, Y = oy + o + r * px;
      if (q.style === 'dots') { x.beginPath(); x.arc(X + px / 2, Y + px / 2, px * 0.42, 0, Math.PI * 2); x.fill(); }
      else if (q.style === 'rounded') rr(X + px * 0.06, Y + px * 0.06, px * 0.88, px * 0.88, px * 0.3);
      else x.fillRect(X, Y, px, px);
    }
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(function (pp) {
      var X = o + pp[1] * px, Y = oy + o + pp[0] * px, round = q.style === 'square' ? 0 : 1;
      x.fillStyle = col; rr(X, Y, 7 * px, 7 * px, round * px * 2);
      x.fillStyle = '#ffffff'; rr(X + px, Y + px, 5 * px, 5 * px, round * px * 1.4);
      x.fillStyle = col; rr(X + 2 * px, Y + 2 * px, 3 * px, 3 * px, round * px);
    });
    if (q.useLogo && logoImg) {
      var box = Math.round(n * px * 0.22), bx = (size - box) / 2;
      x.fillStyle = '#ffffff'; rr(bx - px * 0.6, oy + bx - px * 0.6, box + px * 1.2, box + px * 1.2, px * 1.5);
      var ratio = Math.min(box / logoImg.width, box / logoImg.height), w = logoImg.width * ratio, h = logoImg.height * ratio;
      x.drawImage(logoImg, (size - w) / 2, oy + (size - h) / 2, w, h);
    }
    var y = oy + size;
    if (botCapH) {
      x.fillStyle = col; x.font = '700 ' + Math.round(px * 3.6) + 'px ' + FONT;
      x.fillText(cap, size / 2, y + Math.round(px * 3.2), size - o);
      if (biz) { x.fillStyle = '#8b8e82'; x.font = '500 ' + Math.round(px * 2.4) + 'px ' + FONT; x.fillText(biz, size / 2, y + Math.round(px * 7.4), size - o); }
      y += botCapH;
    }
    if (det.length) {
      var ly = y + px * 1.5;
      det.forEach(function (l) {
        ly += l.size * px * 1.15;
        x.fillStyle = l.color; x.font = l.weight + ' ' + Math.round(px * l.size) + 'px ' + FONT;
        if ('letterSpacing' in x) x.letterSpacing = l.spaced ? Math.round(px * 0.25) + 'px' : '0px';
        x.fillText(l.t, size / 2, Math.round(ly), size - o);
        ly += l.size * px * 0.3;
      });
      if ('letterSpacing' in x) x.letterSpacing = '0px';
    }
  };

  var svgString = function (m) {
    var n = m.length, quiet = 4, size = n + quiet * 2, pay = isPayLayout(), cap = q.caption.trim(), det = detailLines(), p = [];
    var topH = pay && cap ? 6.5 : 0, botCapH = !pay && cap ? (biz ? 14 : 10) : 0, detH = det.length ? 1.5 + linesHeight(det) + 2 : 0;
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (m[r][c] && !isFinder(r, c, n)) {
      var X = c + quiet, Y = r + quiet + topH;
      if (q.style === 'dots') p.push('<circle cx="' + (X + 0.5) + '" cy="' + (Y + 0.5) + '" r="0.42"/>');
      else if (q.style === 'rounded') p.push('<rect x="' + (X + 0.06) + '" y="' + (Y + 0.06) + '" width="0.88" height="0.88" rx="0.3"/>');
      else p.push('<rect x="' + X + '" y="' + Y + '" width="1" height="1"/>');
    }
    var rnd = q.style === 'square' ? 0 : 1;
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(function (f) {
      var X = f[1] + quiet, Y = f[0] + quiet + topH;
      p.push('<rect x="' + X + '" y="' + Y + '" width="7" height="7" rx="' + 2 * rnd + '"/><rect x="' + (X + 1) + '" y="' + (Y + 1) + '" width="5" height="5" rx="' + 1.4 * rnd + '" fill="#fff"/><rect x="' + (X + 2) + '" y="' + (Y + 2) + '" width="3" height="3" rx="' + rnd + '"/>');
    });
    var esc = function (v) { return String(v).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };
    var txt = function (t, y, sz, wt, fill, spacing) { return '<text x="' + size / 2 + '" y="' + y.toFixed(2) + '" text-anchor="middle" font-family="Public Sans, Arial, sans-serif" font-weight="' + wt + '" font-size="' + sz + '" fill="' + fill + '"' + (spacing ? ' letter-spacing="' + spacing + '"' : '') + '>' + esc(t) + '</text>'; };
    var t = '';
    if (topH) t += txt(cap, 5.6, 4, 800, q.color);
    var y = topH + size;
    if (botCapH) { t += txt(cap, y + 3.4, 3.6, 700, q.color); if (biz) t += txt(biz, y + 7.6, 2.4, 500, '#8b8e82'); y += botCapH; }
    if (det.length) {
      var ly = y + 1.5;
      det.forEach(function (l) { ly += l.size * 1.15; t += txt(l.t, ly, l.size, l.weight, l.color, l.spaced ? 0.25 : 0); ly += l.size * 0.3; });
    }
    var h = topH + size + botCapH + detH;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + h + '" width="' + size * 16 + '" height="' + Math.round(h * 16) + '"><rect width="100%" height="100%" fill="#fff"/><g fill="' + q.color + '">' + p.join('') + '</g>' + t + '</svg>';
  };

  var current = null;
  var render = function () {
    $$('[data-qtype]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-qtype') === q.type)); });
    $$('[data-qpanel]').forEach(function (p) { p.hidden = p.getAttribute('data-qpanel') !== q.type; });
    $$('[data-qstyle]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-qstyle') === q.style)); });
    $$('[data-qcolor]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-qcolor').toLowerCase() === q.color.toLowerCase())); });
    var data = payload(), cv = $('#qr-canvas'), empty = $('#qr-empty'), out = $('#qr-data');
    var lg = $('#qr-logo-row'); if (lg) lg.hidden = !shared.logo;
    if (!data) { var pz = $('#qr-pay'); if (pz) pz.hidden = true; current = null; cv.hidden = true; empty.hidden = false; out.textContent = ''; $$('[data-qsave]').forEach(function (b) { b.disabled = true; }); return; }
    var m;
    try { m = matrix(data, q.useLogo && !!logoImg); } catch (e) { m = null; }
    if (!m) { current = null; cv.hidden = true; empty.hidden = false; empty.textContent = data.length > 1200 ? 'That is too much text for one QR code. Shorten it and try again.' : 'Loading the QR code…'; return; }
    current = m; cv.hidden = false; empty.hidden = true;
    /* draw at high resolution so the preview stays sharp on retina phones and laptops */
    var dpr = Math.max(2, Math.min(4, window.devicePixelRatio || 1));
    draw(cv, m, Math.ceil(Math.max(10, 360 / (m.length + 8)) * dpr));
    out.textContent = data.length > 140 ? data.slice(0, 140) + '…' : data;
    var pay = $('#qr-pay'), row = $('#qr-data-row'), isPay = q.type === 'payment';
    if (pay) {
      pay.hidden = !isPay; if (row) row.hidden = isPay;
      if (isPay) {
        var e = function (v) { return String(v).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };
        pay.innerHTML = '<span class="qp-k">What customers see when they scan</span>' +
          '<div class="qp-row"><span>Bank</span><b>' + e(q.bank.trim() || '-') + '</b></div>' +
          '<div class="qp-row qp-big"><span>Account number</span><b class="num">' + e(q.acct.trim()) + '</b></div>' +
          '<div class="qp-row"><span>Account name</span><b>' + e(q.acctName.trim() || '-') + '</b></div>' +
          (String(q.amount).trim() ? '<div class="qp-row"><span>Amount</span><b class="num">₦' + e(Number(q.amount).toLocaleString('en-NG')) + '</b></div>' : '');
      }
    }
    $$('[data-qsave]').forEach(function (b) { b.disabled = false; });
  };

  $$('[data-q]').forEach(function (el) {
    var k = el.getAttribute('data-q');
    if (el.type === 'checkbox') el.checked = !!q[k]; else el.value = q[k] == null ? '' : q[k];
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', function () {
      q[k] = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'colorPick') q.color = el.value;
      save(); render();
    });
  });
  var colorPick = $('#qr-color'); if (colorPick) { colorPick.value = q.color; colorPick.addEventListener('input', function () { q.color = colorPick.value; save(); render(); }); }
  $$('[data-qtype]').forEach(function (b) { b.addEventListener('click', function () {
    var prev = q.type; q.type = b.getAttribute('data-qtype');
    if (q.caption === CAPTIONS[prev] || !q.caption) { q.caption = CAPTIONS[q.type]; var ci = $('#qr-caption'); if (ci) ci.value = q.caption; }
    save(); render();
  }); });
  $$('[data-qstyle]').forEach(function (b) { b.addEventListener('click', function () { q.style = b.getAttribute('data-qstyle'); save(); render(); }); });
  $$('[data-qcolor]').forEach(function (b) { b.addEventListener('click', function () { q.color = b.getAttribute('data-qcolor'); if (colorPick) colorPick.value = q.color; save(); render(); }); });

  var toast = function (msg) {
    var t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 1800);
  };
  var saveBlob = function (blob, name) {
    var fallback = function () {
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 1500); toast('Saved ' + name);
    };
    var cl = window.claude && window.claude.use ? window.claude.use('downloads') : Promise.resolve(null);
    return cl.then(function (d) {
      if (!d) return fallback();
      return d.save({ filename: name, data: blob }).then(function () { toast('Saved ' + name); }, function (e) {
        if (e && e.code === 'declined') return;
        if (e && (e.code === 'unavailable' || e.code === 'not_granted')) return fallback();
        toast('Could not save the file');
      });
    }, fallback);
  };
  var fname = function (ext) { return ((biz || 'fyll') + '-qr-' + q.type).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-') + '.' + ext; };
  $$('[data-qsave]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!current) return;
      if (b.getAttribute('data-qsave') === 'svg') { saveBlob(new Blob([svgString(current)], { type: 'image/svg+xml' }), fname('svg')); return; }
      var big = document.createElement('canvas'); draw(big, current, 24);
      big.toBlob(function (bl) { if (bl) saveBlob(bl, fname('png')); else toast('Could not create the image'); }, 'image/png');
    });
  });

  var boot = function () { loadLogo(function () { render(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(render); }); };
  if (window.qrcode) boot();
  else {
    var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    s.onload = boot; s.onerror = function () { var e = $('#qr-empty'); if (e) { e.hidden = false; e.textContent = 'Could not load the QR maker. Check your connection and refresh.'; } };
    document.head.appendChild(s);
  }
})();
