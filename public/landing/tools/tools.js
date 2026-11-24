/* Fyll Free Tools: shared logic for every tool page. Business details are saved once and reused across tools. */
(function () {
  'use strict';
  var KEY = 'fyll-free-tools-v1';
  var CUR = {
    NGN: { s: '₦', name: 'naira' },
    GHS: { s: 'GH₵ ', name: 'Ghanaian cedis' },
    KES: { s: 'KSh ', name: 'Kenyan shillings' },
    ZAR: { s: 'R ', name: 'South African rand' },
    USD: { s: '$', name: 'US dollars' }
  };
  var today = new Date();
  var iso = function (d) { var z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
  var plus = function (days) { var d = new Date(today); d.setDate(d.getDate() + days); return d; };

  var DEFAULTS = {
    bizName: '', bizUrl: '', bizEmail: '', bizPhone: '', bizAddress: '', bizState: 'Lagos', currency: 'NGN',
    /* invoice */
    invNo: 'INV-0001', invDate: iso(today), invDue: iso(plus(7)), clName: '', clPhone: '', clEmail: '', clAddress: '',
    items: [{ d: 'Rose Oud 50ml', q: 1, p: 28000 }, { d: 'Body mist', q: 2, p: 9500 }],
    invTpl: 'classic', logo: '', invDelivery: 3500, invDiscount: 0, invVat: false, bankName: '', acctNo: '', acctName: '', invNotes: 'Thank you for your order.',
    /* profit */
    pMode: 'price', pCost: 12000, pPack: 500, pDeliv: 1000, pFee: 0, pMargin: 35, pPrice: 20000, pQty: 50,
    /* terms */
    tSell: 'products', tPayTransfer: true, tPayCard: false, tPayPod: false, tPayLink: true, tConfirm: 'payment', tRefundUrl: '', tDeliveryUrl: '',
    /* refund */
    rDays: 7, rCondition: 'unused, unwashed and in the original packaging with tags attached', rHours: 48,
    rNoFood: true, rNoUnder: true, rNoBeauty: true, rNoCustom: true, rNoSale: false,
    rShip: 'customer', rMethod: 'transfer', rRefundDays: 5, rStart: 'returns',
    /* delivery */
    dProc: '1 to 2', dDays: 'Monday to Saturday', dCity: '', dLocalTime: '1 to 2 business days', dLocalFee: 3000,
    dInterTime: '2 to 5 business days', dInterFee: 5000, dIntl: false, dIntlTime: '7 to 14 business days',
    dPickup: false, dPickupAddr: '', dPod: false, dPartners: '', dTrack: true, dRedeliver: 'once more the next business day', dRedeliverFee: 1500
  };

  var st;
  try { st = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { st = Object.assign({}, DEFAULTS); }
  if (!Array.isArray(st.items) || !st.items.length) st.items = DEFAULTS.items.slice();
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };

  /* helpers */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : 0; };
  var sym = function () { return (CUR[st.currency] || CUR.NGN).s; };
  var money = function (v) { var n = num(v); var s = Math.abs(n).toLocaleString('en-NG', { maximumFractionDigits: 2 }); return (n < 0 ? '-' : '') + sym() + s; };
  var longDate = function (s) { var d = s ? new Date(s + 'T12:00:00') : today; return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); };
  var biz = function () { return st.bizName.trim() || '[Your business name]'; };
  var stateName = function () { return st.bizState === 'FCT' ? 'the Federal Capital Territory, Abuja' : (st.bizState + ' State'); };
  var city = function () { return st.dCity.trim() || (st.bizState === 'FCT' ? 'Abuja' : st.bizState); };
  var contactLine = function () {
    var bits = [];
    if (st.bizEmail.trim()) bits.push('email ' + st.bizEmail.trim());
    if (st.bizPhone.trim()) bits.push('call or WhatsApp ' + st.bizPhone.trim());
    return bits.length ? bits.join(', or ') : '[add your email or phone number]';
  };
  var toast = function (msg) {
    var t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 1800);
  };
  var copy = function (text, btn, label) {
    var ok = function () { if (btn) { var o = btn.textContent; btn.textContent = 'Copied'; btn.classList.add('done'); setTimeout(function () { btn.textContent = o; btn.classList.remove('done'); }, 1600); } toast(label || 'Copied'); };
    var fallback = function () {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      var done = false; try { done = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta); if (done) ok(); else toast('Select the text in the preview and copy it');
    };
    try { navigator.clipboard.writeText(text).then(ok, fallback); } catch (e) { fallback(); }
  };

  /* document model -> html + plain text */
  var doc = function (title, intro, sections, note) {
    var h = '<h2>' + esc(title) + '</h2><p class="meta">' + esc(biz()) + ' · Last updated ' + esc(longDate()) + '</p>';
    var t = title.toUpperCase() + '\n' + biz() + ' · Last updated ' + longDate() + '\n\n';
    if (intro) { h += '<p style="margin-top:16px">' + esc(intro) + '</p>'; t += intro + '\n\n'; }
    sections.forEach(function (s, i) {
      h += '<h3>' + (i + 1) + '. ' + esc(s.h) + '</h3>'; t += (i + 1) + '. ' + s.h + '\n';
      (s.p || []).forEach(function (p) { h += '<p>' + esc(p) + '</p>'; t += p + '\n'; });
      if (s.ul && s.ul.length) { h += '<ul>' + s.ul.map(function (li) { return '<li>' + esc(li) + '</li>'; }).join('') + '</ul>'; t += s.ul.map(function (li) { return '• ' + li; }).join('\n') + '\n'; }
      t += '\n';
    });
    if (note) h += '<p class="note">' + esc(note) + '</p>';
    return { html: h, text: t.trim() };
  };
  var NOTE = 'This template is a starting point written for businesses in Nigeria. It is not legal advice. Review it, and speak to a lawyer for anything specific to your business.';
  var where = function () { return st.bizUrl.trim() ? 'our online store at ' + st.bizUrl.trim() : 'our online store'; };

  /* ---------- TERMS ---------- */
  var terms = function () {
    var pays = [];
    if (st.tPayTransfer) pays.push('Bank transfer');
    if (st.tPayLink) pays.push('Payment links we send you');
    if (st.tPayCard) pays.push('Debit or credit card');
    if (st.tPayPod) pays.push('Pay on delivery, in selected locations');
    var c = CUR[st.currency] || CUR.NGN;
    var s = [
      { h: 'About us', p: [biz() + ' is a business based in ' + (st.bizAddress.trim() ? st.bizAddress.trim() + ', ' : '') + stateName() + ', Nigeria. To reach us, ' + contactLine() + '.'] },
      { h: 'Orders', p: [
        st.tConfirm === 'payment' ? 'Your order is confirmed once we receive full payment. Until then, items are not reserved for you.' : 'Your order is confirmed once we accept it and send you a confirmation by message or email.',
        'We may decline or cancel an order if an item is out of stock, a price was shown incorrectly, or we cannot confirm your payment. If we cancel an order you have paid for, we will refund you in full.'
      ] },
      { h: 'Prices and payment', p: ['Prices are shown in ' + c.name + '. Delivery fees are shown separately before you pay.' + (pays.length ? ' We accept:' : '')], ul: pays },
      { h: 'Delivery', p: ['We deliver to the address you give us. Delivery times and fees are set out in our Delivery Policy' + (st.tDeliveryUrl.trim() ? ' (' + st.tDeliveryUrl.trim() + ')' : '') + '. Delivery times are estimates and can be affected by things outside our control.'] },
      { h: 'Returns and refunds', p: ['Returns, exchanges and refunds are covered by our Refund Policy' + (st.tRefundUrl.trim() ? ' (' + st.tRefundUrl.trim() + ')' : '') + '. Nothing in these terms takes away your rights under Nigerian consumer protection law, including the Federal Competition and Consumer Protection Act 2018.'] },
      { h: st.tSell === 'services' ? 'Our services' : 'Products', p: [] },
      { h: 'Your information', p: ['We use your name, phone number, delivery address and email to process your order, deliver it and contact you about it. We handle personal data in line with the Nigeria Data Protection Act 2023, and we do not sell your information.'] },
      { h: 'Our content', p: ['Photos, text, logos and designs on ' + where() + ' and our social media pages belong to ' + biz() + '. Please do not copy or reuse them without our permission.'] },
      { h: 'Responsibility', p: ['We are responsible for losses that are a foreseeable result of us breaking these terms. We are not responsible for delays or losses caused by events outside our control, such as courier delays, strikes, network outages or public holidays.', 'Where the law allows, our total responsibility for any order is limited to the amount you paid for it.'] },
      { h: 'Changes to these terms', p: ['We may update these terms from time to time. The version shown when you place your order is the one that applies to it.'] },
      { h: 'Governing law', p: ['These terms are governed by the laws of the Federal Republic of Nigeria. Any dispute will be handled by the courts of ' + stateName() + '.'] },
      { h: 'Contact us', p: ['Questions about these terms? ' + contactLine().charAt(0).toUpperCase() + contactLine().slice(1) + '.'] }
    ];
    var prod = s[5].p;
    if (st.tSell !== 'services') prod.push('We describe and photograph our products as accurately as we can. Colours and finishes may look slightly different on your screen.');
    if (st.tSell !== 'products') prod.push('For services, we will agree the scope, timeline and price with you before we start. Any changes after that may affect the price or timeline.');
    return doc('Terms and Conditions', 'These terms apply when you buy from ' + biz() + ' ("we", "us") through ' + where() + ', our social media pages, WhatsApp or in person. By placing an order, you agree to them.', s, NOTE);
  };

  /* ---------- REFUND ---------- */
  var refund = function () {
    var days = Math.max(0, Math.round(num(st.rDays)));
    var no = [];
    if (st.rNoFood) no.push('Food, drinks and other perishable items');
    if (st.rNoUnder) no.push('Underwear, swimwear and earrings, for hygiene reasons');
    if (st.rNoBeauty) no.push('Beauty, skincare and fragrance products that have been opened or used');
    if (st.rNoCustom) no.push('Custom-made, personalised or altered items');
    if (st.rNoSale) no.push('Items bought on sale or with a discount code');
    var start = st.rStart === 'returns' ? 'Start your return at returns.fyll.app with your order number and email.'
      : st.rStart === 'whatsapp' ? 'Send us a message on WhatsApp' + (st.bizPhone.trim() ? ' at ' + st.bizPhone.trim() : '') + ' with your order number, the item and the reason.'
      : 'Email us' + (st.bizEmail.trim() ? ' at ' + st.bizEmail.trim() : '') + ' with your order number, the item and the reason.';
    var ship = st.rShip === 'customer' ? 'You pay for return delivery on change-of-mind returns. We cover it when an item is faulty or wrong.'
      : st.rShip === 'us' ? 'We cover the cost of return delivery. We will arrange a pickup or tell you how to send it back.'
      : 'We cover return delivery only when an item is faulty or wrong. For change-of-mind returns, please send it back at your own cost.';
    var how = { transfer: 'by bank transfer to the account you paid from', credit: 'as store credit you can use on your next order', exchange: 'as an exchange for the same item in another size or colour, or another item of equal value', choice: 'by bank transfer, store credit or an exchange, whichever you prefer' }[st.rMethod];
    var s = [
      { h: 'Change of mind', p: [days > 0 ? 'You can return most items within ' + days + ' day' + (days === 1 ? '' : 's') + ' of delivery if you change your mind. Items must be ' + (st.rCondition.trim() || 'unused and in their original condition') + '.' : 'We do not accept returns for change of mind, so please check sizes, colours and details before you order. Faulty or wrong items are covered below.'] },
      { h: 'Faulty, damaged or wrong items', p: ['If your item arrives damaged, faulty or is not what you ordered, tell us within ' + Math.max(1, Math.round(num(st.rHours))) + ' hours of delivery and send photos or a short video. We will replace it, repair it or give you a full refund.'] },
      { h: 'Items we cannot take back', p: no.length ? ['Unless they arrive faulty or wrong, we cannot accept returns of:'] : ['We accept returns on all items, as long as they meet the conditions above.'], ul: no },
      { h: 'How to start a return', p: [start, 'Please do not send items back before we confirm your return.'] },
      { h: 'Return delivery', p: [ship] },
      { h: 'Refunds', p: ['Once we receive and check the item, we will confirm your refund within 2 business days and send it ' + how + ' within ' + Math.max(1, Math.round(num(st.rRefundDays))) + ' business days.', 'Original delivery fees are not refunded unless the item was faulty or wrong.'] },
      { h: 'Your rights', p: ['This policy does not affect your rights under Nigerian consumer protection law, including the Federal Competition and Consumer Protection Act 2018.'] },
      { h: 'Contact us', p: ['Questions about a return? ' + contactLine().charAt(0).toUpperCase() + contactLine().slice(1) + '.'] }
    ];
    return doc('Refund and Returns Policy', 'We want you to love your order from ' + biz() + '. This policy explains when you can return an item and how refunds work.', s, NOTE);
  };

  /* ---------- DELIVERY ---------- */
  var delivery = function () {
    var zones = ['Within ' + city() + ': ' + (st.dLocalTime.trim() || '1 to 2 business days') + (num(st.dLocalFee) ? ', from ' + money(st.dLocalFee) : '') + '.',
      'Other states in Nigeria: ' + (st.dInterTime.trim() || '2 to 5 business days') + (num(st.dInterFee) ? ', from ' + money(st.dInterFee) : '') + '.'];
    if (st.dIntl) zones.push('Outside Nigeria: ' + (st.dIntlTime.trim() || '7 to 14 business days') + '. We will confirm the fee before you pay.');
    var s = [
      { h: 'Processing time', p: ['We prepare orders within ' + (st.dProc.trim() || '1 to 2') + ' business days after your payment is confirmed. We dispatch orders ' + (st.dDays.trim() || 'Monday to Saturday') + ', except public holidays.'] },
      { h: 'Delivery times and fees', p: ['After dispatch, delivery usually takes:'], ul: zones },
      { h: 'How we deliver', p: [] },
      { h: 'Tracking your order', p: [st.dTrack ? 'Once your order is dispatched, we will send you a tracking link so you can follow it on track.fyll.app.' : 'Once your order is dispatched, we will message you with your rider or courier details.'] },
      { h: 'Delays', p: ['Delivery times are estimates. Public holidays, weather, strikes and courier delays can affect them. If your order is delayed, we will let you know.'] },
      { h: 'Address and failed delivery', p: ['Please make sure your address and phone number are correct and that someone can receive the order. If the rider cannot reach you, they will try ' + (st.dRedeliver.trim() || 'once more') + '.' + (num(st.dRedeliverFee) ? ' A re-delivery fee of ' + money(st.dRedeliverFee) + ' may apply.' : '')] },
      { h: 'Damaged in transit', p: ['If your order arrives damaged, take photos and contact us within 48 hours. We will arrange a replacement or refund under our Refund Policy.'] },
      { h: 'Contact us', p: ['Questions about delivery? ' + contactLine().charAt(0).toUpperCase() + contactLine().slice(1) + '.'] }
    ];
    var hw = s[2].p;
    hw.push(st.dPartners.trim() ? 'We deliver with ' + st.dPartners.trim() + '.' : 'We deliver with trusted riders and logistics partners.');
    hw.push('Exact delivery fees are shown at checkout or confirmed by message, based on your address.');
    if (st.dPickup) hw.push('You can also pick up your order' + (st.dPickupAddr.trim() ? ' at ' + st.dPickupAddr.trim() : '') + ' once we tell you it is ready.');
    if (st.dPod) hw.push('Pay on delivery is available within ' + city() + ' only, and may require a small commitment fee.');
    return doc('Delivery Policy', biz() + ' delivers across Nigeria' + (st.dIntl ? ' and internationally' : '') + '. Here is what to expect after you order.', s, NOTE);
  };

  /* ---------- INVOICE ---------- */
  var invoiceCalc = function () {
    var sub = st.items.reduce(function (a, it) { return a + num(it.q) * num(it.p); }, 0);
    var del = num(st.invDelivery), dis = num(st.invDiscount);
    var base = Math.max(0, sub - dis);
    var vat = st.invVat ? base * 0.075 : 0;
    return { sub: sub, del: del, dis: dis, vat: vat, total: base + vat + del };
  };
  var invoice = function () {
    var c = invoiceCalc();
    var initials = (st.bizName.trim() || 'Your Business').split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
    var rows = st.items.filter(function (it) { return it.d || num(it.p); }).map(function (it) {
      return '<tr><td>' + esc(it.d || 'Item') + '</td><td class="r num">' + esc(num(it.q)) + '</td><td class="r num">' + esc(money(it.p)) + '</td><td class="r num">' + esc(money(num(it.q) * num(it.p))) + '</td></tr>';
    }).join('');
    var tpl = ['classic', 'bold', 'minimal'].indexOf(st.invTpl) > -1 ? st.invTpl : 'classic';
    var no = st.invNo || 'INV-0001';
    var logo = st.logo && /^data:image\//.test(st.logo) ? '<img class="inv-logo-img" alt="" src="' + esc(st.logo) + '">' : '<div class="inv-logo">' + esc(initials) + '</div>';
    var brand = '<div class="inv-brand">' + logo + '<div><b>' + esc(biz()) + '</b><span>' + esc([st.bizPhone, st.bizEmail].filter(Boolean).join(' · ') || 'Add your phone and email') + '</span></div></div>';
    var head;
    if (tpl === 'minimal') {
      head = '<div class="inv-head"><div><div class="inv-title">Invoice</div><span class="inv-no">' + esc(no) + '</span></div>' + brand + '</div>' +
        '<div class="inv-dates"><div><span class="k">Issued</span>' + esc(longDate(st.invDate)) + '</div><div><span class="k">Due</span>' + esc(longDate(st.invDue)) + '</div><div><span class="k">Amount due</span><b class="num">' + esc(money(c.total)) + '</b></div></div>';
    } else {
      head = '<div class="inv-head">' + brand + '<div class="inv-meta"><b>Invoice</b><span>' + esc(no) + '</span><span>Issued ' + esc(longDate(st.invDate)) + '</span><span>Due ' + esc(longDate(st.invDue)) + '</span></div></div>';
    }
    var h = '<div class="inv inv-' + tpl + '">' + head +
      '<div class="inv-parties"><div><span class="k">Billed to</span><b>' + esc(st.clName || 'Customer name') + '</b><br>' + esc([st.clPhone, st.clEmail].filter(Boolean).join(' · ')) + (st.clAddress ? '<br>' + esc(st.clAddress) : '') + '</div>' +
      '<div><span class="k">From</span>' + esc(biz()) + (st.bizAddress ? '<br>' + esc(st.bizAddress) : '') + '<br>' + esc(stateName().replace(/^the /, '')) + '</div></div>' +
      '<table class="inv-table"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>' + (rows || '<tr><td colspan="4">Add an item</td></tr>') + '</tbody></table>' +
      '<div class="inv-sum"><div><span>Subtotal</span><span class="num">' + money(c.sub) + '</span></div>' +
      (c.dis ? '<div><span>Discount</span><span class="num">-' + money(c.dis) + '</span></div>' : '') +
      (st.invVat ? '<div><span>VAT (7.5%)</span><span class="num">' + money(c.vat) + '</span></div>' : '') +
      (c.del ? '<div><span>Delivery</span><span class="num">' + money(c.del) + '</span></div>' : '') +
      '<div class="grand"><span>Total</span><span class="num">' + money(c.total) + '</span></div></div>' +
      '<div class="inv-pay"><span class="k">Pay by bank transfer</span><b>' + esc(st.bankName || 'Bank name') + ' · <span class="num">' + esc(st.acctNo || '0000000000') + '</span></b><span>' + esc(st.acctName || 'Account name') + '</span><span>Use ' + esc(no) + ' as your narration.</span></div>' +
      (st.invNotes ? '<p class="meta">' + esc(st.invNotes) + '</p>' : '') + '</div>';
    var lines = st.items.filter(function (it) { return it.d || num(it.p); }).map(function (it) { return '• ' + (it.d || 'Item') + ' × ' + num(it.q) + ' — ' + money(num(it.q) * num(it.p)); });
    var wa = '*Invoice ' + (st.invNo || 'INV-0001') + '* from ' + biz() + '\nIssued: ' + longDate(st.invDate) + '\nDue: ' + longDate(st.invDue) + '\n\nBilled to: ' + (st.clName || 'Customer') + '\n\n' + lines.join('\n') +
      '\n\nSubtotal: ' + money(c.sub) + (c.dis ? '\nDiscount: -' + money(c.dis) : '') + (st.invVat ? '\nVAT (7.5%): ' + money(c.vat) : '') + (c.del ? '\nDelivery: ' + money(c.del) : '') + '\n*Total: ' + money(c.total) + '*' +
      '\n\n*Pay by bank transfer*\n' + (st.bankName || 'Bank name') + '\n' + (st.acctNo || '0000000000') + '\n' + (st.acctName || 'Account name') + '\nNarration: ' + (st.invNo || 'INV-0001') + (st.invNotes ? '\n\n' + st.invNotes : '');
    return { html: h, text: wa.replace(/\*/g, ''), wa: wa };
  };
  var renderItems = function () {
    var box = $('#items'); if (!box) return;
    box.innerHTML = st.items.map(function (it, i) {
      return '<div class="item" data-i="' + i + '">' +
        '<div class="f"><label for="it-d-' + i + '">Item</label><input id="it-d-' + i + '" data-f="d" value="' + esc(it.d) + '" placeholder="What did you sell?"></div>' +
        '<div class="f"><label for="it-q-' + i + '">Qty</label><input id="it-q-' + i + '" data-f="q" type="number" min="0" inputmode="numeric" value="' + esc(it.q) + '"></div>' +
        '<div class="f price"><label for="it-p-' + i + '">Price (' + esc(sym().trim()) + ')</label><input id="it-p-' + i + '" data-f="p" type="number" min="0" inputmode="decimal" value="' + esc(it.p) + '"></div>' +
        '<button type="button" class="icon-btn" data-del="' + i + '" aria-label="Remove item ' + (i + 1) + '"' + (st.items.length < 2 ? ' disabled' : '') + '><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
    }).join('');
  };

  /* ---------- PROFIT ---------- */
  var profit = function () {
    var cost = num(st.pCost) + num(st.pPack) + num(st.pDeliv), fee = Math.min(num(st.pFee), 90) / 100, qty = num(st.pQty);
    var price;
    if (st.pMode === 'price') { var m = Math.min(num(st.pMargin), 95) / 100; price = (1 - m - fee) > 0 ? cost / (1 - m - fee) : 0; }
    else price = num(st.pPrice);
    var feeAmt = price * fee, pp = price - cost - feeAmt;
    var margin = price > 0 ? pp / price * 100 : 0, markup = cost > 0 ? pp / cost * 100 : 0;
    var r = { cost: cost, price: price, feeAmt: feeAmt, pp: pp, margin: margin, markup: markup, monthly: pp * qty };
    var set = function (id, v, neg) { var el = document.getElementById(id); if (el) { el.textContent = v; el.classList.toggle('neg', !!neg); } };
    set('o-price', money(Math.round(price)));
    set('o-label', st.pMode === 'price' ? 'Suggested selling price' : 'Your selling price');
    set('o-pp', money(Math.round(pp)), pp < 0);
    set('o-margin', margin.toFixed(1) + '%', pp < 0);
    set('o-markup', markup.toFixed(1) + '%', pp < 0);
    set('o-monthly', money(Math.round(r.monthly)), pp < 0);
    set('o-cost', money(Math.round(cost + feeAmt)));
    var lad = document.getElementById('ladder');
    if (lad) {
      lad.innerHTML = [20, 30, 40, 50, 60].map(function (mm) {
        var pr = (1 - mm / 100 - fee) > 0 ? cost / (1 - mm / 100 - fee) : 0, pf = pr - cost - pr * fee;
        var hl = st.pMode === 'price' && Math.round(num(st.pMargin)) === mm;
        return '<tr' + (hl ? ' class="hl"' : '') + '><td>' + mm + '% margin</td><td class="r num">' + money(Math.round(pr)) + '</td><td class="r num">' + money(Math.round(pf)) + '</td></tr>';
      }).join('');
    }
    $$('[data-mode-only]').forEach(function (el) { el.hidden = el.getAttribute('data-mode-only') !== st.pMode; });
    $$('.seg button[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === st.pMode)); });
    return r;
  };

  /* ---------- wiring ---------- */
  var tool = document.body.getAttribute('data-tool');
  var current = { text: '' };
  var render = function () {
    var out = null;
    if (tool === 'terms') out = terms();
    else if (tool === 'refund') out = refund();
    else if (tool === 'delivery') out = delivery();
    else if (tool === 'invoice') out = invoice();
    else if (tool === 'profit') profit();
    if (out) { var sh = $('#sheet'); if (sh) sh.innerHTML = out.html; current = out; }
    $$('[data-biz-name]').forEach(function (el) { el.textContent = st.bizName.trim() ? st.bizName.trim() : 'Not set yet'; });
    $$('.sym').forEach(function (el) { el.textContent = sym().trim(); });
  };

  $$('[data-k]').forEach(function (el) {
    var k = el.getAttribute('data-k');
    if (el.type === 'checkbox') el.checked = !!st[k];
    else if (st[k] != null) el.value = st[k];
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', function () {
      st[k] = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'currency') renderItems();
      save(); render();
    });
  });
  $$('.seg button[data-mode]').forEach(function (b) { b.addEventListener('click', function () { st.pMode = b.getAttribute('data-mode'); save(); render(); }); });

  var items = $('#items');
  if (items) {
    renderItems();
    items.addEventListener('input', function (e) {
      var row = e.target.closest('.item'); if (!row) return;
      var i = +row.getAttribute('data-i'), f = e.target.getAttribute('data-f');
      st.items[i][f] = f === 'd' ? e.target.value : e.target.value; save(); render();
    });
    items.addEventListener('click', function (e) {
      var b = e.target.closest('[data-del]'); if (!b || st.items.length < 2) return;
      st.items.splice(+b.getAttribute('data-del'), 1); save(); renderItems(); render();
    });
    $('#add-item').addEventListener('click', function () {
      st.items.push({ d: '', q: 1, p: 0 }); save(); renderItems(); render();
      var last = $('#items .item:last-child input'); if (last) last.focus();
    });
  }

  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var kind = b.getAttribute('data-copy');
      if (kind === 'wa') copy(current.wa || current.text, b, 'Invoice copied for WhatsApp');
      else copy(current.text, b, 'Copied to your clipboard');
    });
  });

  /* ---------- invoice: template, logo, save as image / PDF ---------- */
  var tplBtns = $$('.tpl[data-tpl]');
  var syncTpl = function () { tplBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tpl') === st.invTpl)); }); };
  tplBtns.forEach(function (b) { b.addEventListener('click', function () { st.invTpl = b.getAttribute('data-tpl'); save(); syncTpl(); render(); }); });
  syncTpl();

  var logoPrev = $('#logoPrev'), logoClear = $('#logoClear'), logoFile = $('#logoFile'), logoHint = $('#logoHint');
  var syncLogo = function () {
    if (!logoPrev) return;
    var has = !!st.logo && /^data:image\//.test(st.logo);
    logoPrev.style.backgroundImage = has ? 'url("' + st.logo + '")' : '';
    logoClear.hidden = !has;
    logoHint.textContent = has ? 'Logo added. It shows on every template.' : 'Optional. PNG, JPG or SVG. Stays on your device.';
  };
  if (logoFile) {
    logoFile.addEventListener('change', function () {
      var f = logoFile.files && logoFile.files[0]; logoFile.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) { toast('Choose an image file'); return; }
      var fr = new FileReader();
      fr.onerror = function () { toast('Could not read that file'); };
      fr.onload = function () {
        var im = new Image();
        im.onerror = function () { toast('Could not open that image'); };
        im.onload = function () {
          var w = im.naturalWidth || im.width || 300, hh = im.naturalHeight || im.height || 300;
          var r = Math.min(1, 480 / Math.max(w, hh)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * r)); c.height = Math.max(1, Math.round(hh * r));
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          try { st.logo = c.toDataURL('image/png'); } catch (e) { toast('Could not use that image'); return; }
          save(); syncLogo(); render(); toast('Logo added');
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(f);
    });
    logoClear.addEventListener('click', function () { st.logo = ''; save(); syncLogo(); render(); });
    syncLogo();
  }

  var loadScript = function (src, ready) {
    return new Promise(function (res, rej) {
      if (ready()) return res();
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('load')); }; document.head.appendChild(s);
    });
  };
  var snapshot = function () {
    return loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', function () { return window.html2canvas; })
      .then(function () { return document.fonts && document.fonts.ready; })
      .then(function () {
        var stage = document.createElement('div'); stage.className = 'inv-stage'; stage.innerHTML = current.html + '<div class="inv-powered">Powered by <b>Fyll</b> · fyll.app</div>'; document.body.appendChild(stage);
        var clean = function () { if (stage.parentNode) stage.parentNode.removeChild(stage); };
        return window.html2canvas(stage, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false }).then(function (cv) { clean(); return cv; }, function (e) { clean(); throw e; });
      });
  };
  var fileName = function (ext) { return (st.invNo || 'invoice').replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '') + '.' + ext; };
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
  var toBlob = function (cv) { return new Promise(function (res, rej) { cv.toBlob(function (b) { b ? res(b) : rej(new Error('blob')); }, 'image/png'); }); };
  var makePdf = function (cv) {
    return loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', function () { return window.jspdf; }).then(function () {
      var pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' }), W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
      var pagePx = Math.floor(cv.width * H / W), y = 0, first = true;
      while (y < cv.height) {
        var hPx = Math.min(pagePx, cv.height - y), sl = document.createElement('canvas'); sl.width = cv.width; sl.height = hPx;
        var ctx = sl.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sl.width, sl.height); ctx.drawImage(cv, 0, y, cv.width, hPx, 0, 0, cv.width, hPx);
        if (!first) pdf.addPage(); first = false;
        pdf.addImage(sl.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, W, hPx * W / cv.width);
        y += hPx;
      }
      return pdf.output('blob');
    });
  };
  $$('[data-save]').forEach(function (b) {
    b.addEventListener('click', function () {
      var kind = b.getAttribute('data-save'), label = b.textContent;
      b.disabled = true; b.textContent = 'Preparing…';
      snapshot().then(function (cv) { return kind === 'pdf' ? makePdf(cv).then(function (bl) { return saveBlob(bl, fileName('pdf')); }) : toBlob(cv).then(function (bl) { return saveBlob(bl, fileName('png')); }); })
        .catch(function () { toast('Could not create the file. Check your connection and try again.'); })
        .then(function () { b.disabled = false; b.textContent = label; });
    });
  });

  var reset = $('[data-reset]');
  if (reset) reset.addEventListener('click', function () {
    var keep = ['bizName', 'bizUrl', 'bizEmail', 'bizPhone', 'bizAddress', 'bizState', 'currency', 'logo', 'invTpl'];
    var fresh = Object.assign({}, DEFAULTS); keep.forEach(function (k) { fresh[k] = st[k]; });
    st = fresh; save(); location.reload();
  });

  /* FAQ accordion */
  var qas = $$('.qa');
  qas.forEach(function (q) {
    var btn = $('h3 button', q);
    btn.addEventListener('click', function () {
      var open = !q.classList.contains('open');
      qas.forEach(function (o) { if (o !== q) { o.classList.remove('open'); $('h3 button', o).setAttribute('aria-expanded', 'false'); } });
      q.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open));
    });
  });

  render();
})();
