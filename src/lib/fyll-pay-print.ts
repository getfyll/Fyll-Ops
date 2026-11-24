import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

// Printable Fyll Pay counter card (A4 or A5, colour or black & white).
// The colour version sits on the Fyll Field, the mono version is ink-only on white.

export type PrintSize = 'A4' | 'A5';
export type PrintStyle = 'colour' | 'mono';

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('read'));
  reader.readAsDataURL(blob);
});

// Bundled images are inlined as data URLs so the print page never depends on a network request.
export const loadAssetDataUrl = async (moduleRef: number, mime: string): Promise<string> => {
  const asset = Asset.fromModule(moduleRef);
  if (Platform.OS === 'web') {
    const response = await fetch(asset.uri);
    return blobToDataUrl(await response.blob());
  }
  await asset.downloadAsync();
  const base64 = await FileSystem.readAsStringAsync(asset.localUri ?? asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${mime};base64,${base64}`;
};

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export const buildCounterCardHtml = ({
  size,
  style,
  businessName,
  initials,
  logoUrl,
  amountLabel,
  bankName,
  accountNumber,
  accountName,
  displayUrl,
  qrSvg,
  fieldDataUrl,
  wordmarkDataUrl,
  autoPrint,
}: {
  size: PrintSize;
  style: PrintStyle;
  businessName: string;
  initials: string;
  logoUrl: string | null;
  amountLabel: string | null;
  bankName: string;
  accountNumber: string;
  accountName: string;
  displayUrl: string;
  qrSvg: string;
  fieldDataUrl: string | null;
  wordmarkDataUrl: string | null;
  autoPrint: boolean;
}) => {
  const page = size === 'A4' ? { w: 210, h: 297, s: 1 } : { w: 148, h: 210, s: 0.705 };
  const colour = style === 'colour';
  const mm = (v: number) => `${(v * page.s).toFixed(2)}mm`;
  const pt = (v: number) => `${(v * page.s).toFixed(1)}pt`;
  const logo = logoUrl
    ? `<img class="logo" src="${esc(logoUrl)}" alt="">`
    : `<span class="logo">${esc(initials)}</span>`;
  const wordmark = wordmarkDataUrl ? `<img class="wm" src="${wordmarkDataUrl}" alt="Fyll">` : '<b class="wm-text">fyll</b>';

  return `<!doctype html><html><head><meta charset="utf-8"><title>Fyll Pay · ${esc(businessName)}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&display=swap">
<style>
@page{size:${size};margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{position:relative;width:${page.w}mm;height:${page.h}mm;overflow:hidden;display:flex;flex-direction:column;padding:${mm(16)} ${mm(16)} ${mm(12)};
  ${colour
    ? `color:#fff;background:#141414 ${fieldDataUrl ? `url(${fieldDataUrl}) center/cover no-repeat` : ''};`
    : 'color:#141414;background:#fff;'}}
${colour ? `.page:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,20,20,.45) 0%,rgba(20,20,20,.08) 30%,rgba(20,20,20,.15) 62%,rgba(20,20,20,.82) 100%)}` : `.page:before{content:"";position:absolute;inset:${mm(7)};border:${mm(0.8)} solid #141414;border-radius:${mm(9)}}`}
.page>*{position:relative}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:${mm(3)}}
.wm{height:${mm(9)};width:auto;${colour ? '' : 'filter:invert(1) brightness(.1);'}}
.wm-text{font-size:${pt(24)}}
.pay{font-size:${pt(14)};font-weight:700;padding-left:${mm(3)};border-left:${mm(0.4)} solid ${colour ? 'rgba(255,255,255,.5)' : '#141414'}}
.chip{font-size:${pt(10)};font-weight:600;padding:${mm(1.8)} ${mm(4)};border-radius:99px;border:${mm(0.35)} solid ${colour ? 'rgba(255,255,255,.45)' : '#141414'};${colour ? 'background:rgba(20,22,10,.35);' : ''}}
.middle{flex:1;display:flex;flex-direction:column;justify-content:center;padding:${mm(6)} 0}
.head{display:flex;flex-direction:column;align-items:center;gap:${mm(3)};text-align:center}
/* Business name and "Scan to pay" share one style: Bricolage ExtraBold at the same size. */
.display{font-family:"Bricolage Grotesque",-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;font-size:${pt(36)};font-weight:800;letter-spacing:-.025em;line-height:1.05}
.head h1{margin:0}
.scan{margin-top:${mm(8)};text-align:center}
.scan-sub{margin-top:${mm(2.5)};text-align:center;font-size:${pt(12)};${colour ? 'color:rgba(255,255,255,.85);' : 'color:#3d3f36;'}}
.card{margin:${mm(9)} auto 0;width:${mm(118)};background:#fff;color:#141414;border-radius:${mm(9)};padding:${mm(9)} ${mm(9)} ${mm(7)};display:flex;flex-direction:column;align-items:center;gap:${mm(3)};
  ${colour ? 'box-shadow:0 6mm 14mm rgba(0,0,0,.35);' : `border:${mm(0.5)} solid #141414;`}}
.logo{width:${mm(14)};height:${mm(14)};border-radius:50%;object-fit:cover;border:${mm(0.3)} solid #e4e6dc;background:#141414;color:#d5e057;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${pt(10)}}
.acct{margin-top:${mm(1)};padding-top:${mm(3)};border-top:${mm(0.3)} solid #e4e6dc;align-self:stretch;text-align:center;display:flex;flex-direction:column;gap:${mm(0.8)}}
.acct b{font-size:${pt(11)};letter-spacing:.02em}.acct span{font-size:${pt(8.5)};color:#6b6e62}
.qr svg{display:block;width:${mm(96)};height:${mm(96)}}
.amt{font-size:${pt(17)};font-weight:800;padding:${mm(1.5)} ${mm(5)};border-radius:99px;${colour ? 'background:#d5e057;' : 'border:0.4mm solid #141414;'}}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:${mm(3)}}
.step{display:flex;align-items:center;gap:${mm(2.5)};padding:${mm(3)} ${mm(3.5)};border-radius:${mm(5)};font-size:${pt(10)};font-weight:600;line-height:1.25;
  ${colour ? 'background:rgba(34,36,26,.62);border:0.3mm solid rgba(255,255,255,.18);' : 'border:0.35mm solid #141414;'}}
.n{flex:none;width:${mm(6.5)};height:${mm(6.5)};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${pt(9.5)};font-weight:800;${colour ? 'background:#d5e057;color:#141414;' : 'background:#141414;color:#fff;'}}
.foot{margin-top:${mm(6)};display:flex;justify-content:space-between;align-items:center;font-size:${pt(8)};${colour ? 'color:rgba(255,255,255,.75);' : 'color:#55574e;'}}
.foot .wm{height:${mm(3.2)};${colour ? 'opacity:.8;' : ''}}
.foot span:last-child{display:flex;align-items:center;gap:${mm(1.5)}}
</style></head><body>
<div class="page">
  <div class="top"><span class="brand">${wordmark}<span class="pay">Pay</span></span><span class="chip">Pay by bank transfer</span></div>
  <div class="middle">
  <div class="head"><h1 class="display">${esc(businessName)}</h1></div>
  <div class="card">
    <div class="qr">${qrSvg}</div>
    ${amountLabel ? `<div class="amt">${esc(amountLabel)}</div>` : ''}
    <div class="acct"><b>${esc([bankName, accountNumber].filter(Boolean).join(' · '))}</b><span>${esc(accountName)}</span></div>
  </div>
  <div class="scan display">Scan to pay</div>
  <div class="scan-sub">Point your phone camera at the code</div>
  </div>
  <div class="steps">
    <div class="step"><span class="n">1</span>Scan with your phone camera</div>
    <div class="step"><span class="n">2</span>Transfer to the account shown</div>
    <div class="step"><span class="n">3</span>Upload your receipt</div>
  </div>
  <div class="foot"><span>${esc(displayUrl)}</span><span>Powered by ${wordmarkDataUrl ? `<img class="wm" src="${wordmarkDataUrl}" alt="Fyll">` : 'Fyll'}</span></div>
</div>
${autoPrint ? '<script>window.onload=function(){var go=function(){setTimeout(function(){window.focus();window.print();},200);};(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(go,go);};</script>' : ''}
</body></html>`;
};
