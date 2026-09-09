import { generateQrMatrix } from '@/lib/qrcode';
import type { OrderLabelData } from '@/components/labels/OrderLabel80x90';

// Direct PDF-byte generation, used only for web. window.print() (via an iframe or
// Print.printAsync) has proven unreliable across multiple mobile browsers in this
// environment — observed printing the top-level app page instead of the isolated label
// content on both iOS Safari and Android Chrome. Generating a real PDF file and downloading
// it directly sidesteps browser print dialogs entirely.
//
// This hand-rolls the PDF bytes rather than using a library like pdf-lib because pdf-lib's
// bundled tslib is incompatible with Metro (React Native's bundler) — it throws
// "Cannot destructure property '__extends' of '_tslib.default' as it is undefined" at
// runtime. The real fix requires editing metro.config.js, which this project's rules
// forbid touching, so a real PDF library isn't viable here without that access.
//
// Coordinates mirror the same row/column fractions used by the HTML table layout in
// OrderLabel80x90.tsx, so the two stay visually consistent.

const MM_TO_PT = 2.83465;
const mm = (value: number) => value * MM_TO_PT;

const normalizePdfText = (value: string) => value
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^\x20-\x7E]/g, ' ');

const escapePdfText = (value: string) => normalizePdfText(value)
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)')
  .replace(/\r?\n/g, ' ');

const wrapText = (value: string, maxChars: number): string[] => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
};

const limitText = (value: string, maxLength: number) => (
  value.length > maxLength ? value.slice(0, Math.max(0, maxLength)) : value
);

type PdfWriter = {
  lines: string[];
  drawText: (x: number, y: number, size: number, text: string, color?: 'black' | 'white') => void;
  drawLine: (x1: number, y1: number, x2: number, y2: number) => void;
  drawRect: (x: number, y: number, w: number, h: number) => void;
  drawRoundedRect: (x: number, y: number, w: number, h: number, radius: number) => void;
  fillRect: (x: number, y: number, w: number, h: number, color?: 'black' | 'white') => void;
  drawQr: (value: string, x: number, y: number, size: number) => void;
};

const createWriter = (): PdfWriter => {
  const lines: string[] = ['0.75 w\n'];

  const drawText: PdfWriter['drawText'] = (x, y, size, text, color = 'black') => {
    const rg = color === 'white' ? '1 1 1 rg' : '0 0 0 rg';
    lines.push(`${rg}\nBT /F1 ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(text)}) Tj ET\n0 0 0 rg\n`);
  };
  const drawLine: PdfWriter['drawLine'] = (x1, y1, x2, y2) => {
    lines.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`);
  };
  const drawRect: PdfWriter['drawRect'] = (x, y, w, h) => {
    lines.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S\n`);
  };
  const drawRoundedRect: PdfWriter['drawRoundedRect'] = (x, y, w, h, radius) => {
    const r = Math.min(radius, w / 2, h / 2);
    const c = r * 0.5522847498;
    const x0 = x;
    const x1 = x + w;
    const y0 = y;
    const y1 = y + h;
    lines.push([
      `${(x0 + r).toFixed(2)} ${y0.toFixed(2)} m`,
      `${(x1 - r).toFixed(2)} ${y0.toFixed(2)} l`,
      `${(x1 - r + c).toFixed(2)} ${y0.toFixed(2)} ${x1.toFixed(2)} ${(y0 + r - c).toFixed(2)} ${x1.toFixed(2)} ${(y0 + r).toFixed(2)} c`,
      `${x1.toFixed(2)} ${(y1 - r).toFixed(2)} l`,
      `${x1.toFixed(2)} ${(y1 - r + c).toFixed(2)} ${(x1 - r + c).toFixed(2)} ${y1.toFixed(2)} ${(x1 - r).toFixed(2)} ${y1.toFixed(2)} c`,
      `${(x0 + r).toFixed(2)} ${y1.toFixed(2)} l`,
      `${(x0 + r - c).toFixed(2)} ${y1.toFixed(2)} ${x0.toFixed(2)} ${(y1 - r + c).toFixed(2)} ${x0.toFixed(2)} ${(y1 - r).toFixed(2)} c`,
      `${x0.toFixed(2)} ${(y0 + r).toFixed(2)} l`,
      `${x0.toFixed(2)} ${(y0 + r - c).toFixed(2)} ${(x0 + r - c).toFixed(2)} ${y0.toFixed(2)} ${(x0 + r).toFixed(2)} ${y0.toFixed(2)} c S\n`,
    ].join(' '));
  };
  const fillRect: PdfWriter['fillRect'] = (x, y, w, h, color = 'black') => {
    const rg = color === 'white' ? '1 1 1 rg' : '0 0 0 rg';
    lines.push(`${rg}\n${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n0 0 0 rg\n`);
  };
  const drawQr: PdfWriter['drawQr'] = (value, x, y, size) => {
    const matrix = generateQrMatrix(value || 'FYLL');
    const moduleCount = matrix.length || 1;
    const cell = size / moduleCount;
    matrix.forEach((row, rowIndex) => {
      row.forEach((filled, colIndex) => {
        if (!filled) return;
        // Modules must abut with zero gap — a proportional shrink (e.g. cell * 0.98) looks
        // "crisper" on screen but at real print size (a ~19mm QR) it leaves visible white
        // slivers between adjacent dark modules, breaking the finder/alignment patterns and
        // making the code unscannable. Draw full-bleed squares instead.
        fillRect(x + colIndex * cell, y + (moduleCount - rowIndex - 1) * cell, cell, cell);
      });
    });
  };

  return { lines, drawText, drawLine, drawRect, drawRoundedRect, fillRect, drawQr };
};

const ROW_FRACTIONS = [7.5, 13.5, 7.5, 22.5, 9.5, 18, 4];
const ROW_TOTAL = ROW_FRACTIONS.reduce((sum, value) => sum + value, 0);

const renderShippingLabelPage = (writer: PdfWriter, data: OrderLabelData, widthMm: number, heightMm: number) => {
  const width = mm(widthMm);
  const height = mm(heightMm);
  const hasWebsiteOrder = !!data.websiteOrderRef;
  const primaryOrderNumber = hasWebsiteOrder ? data.websiteOrderRef! : data.orderNumber;
  const addressParts = data.deliveryAddress.split(',').map((part) => part.trim()).filter(Boolean);
  const state = addressParts[addressParts.length - 1] || 'NG';
  const stateCode = state.slice(0, 3).toUpperCase();
  const provider = data.logisticsProvider || 'Delivery Partner';
  const returnAddress = data.returnAddress || 'Return address not set';
  const printDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).toUpperCase();

  const left = mm(2.5);
  const right = width - mm(2.5);
  const contentWidth = right - left;
  const outerTop = height - mm(2);
  const outerBottom = mm(2);
  const usableHeight = outerTop - outerBottom;
  const rowHeights = ROW_FRACTIONS.map((f) => (f / ROW_TOTAL) * usableHeight);

  writer.drawRoundedRect(left, outerBottom, contentWidth, usableHeight, mm(2.8));

  // Row boundaries, top to bottom.
  let y = outerTop;
  const bounds: number[] = [y];
  rowHeights.forEach((h) => {
    y -= h;
    bounds.push(y);
  });
  const [carrierTop, metaTop, routeTop, recipientTop, orderTop, returnTop, footerTop] = bounds;
  [metaTop, routeTop, recipientTop, orderTop, returnTop, footerTop].forEach((lineY) => {
    writer.drawLine(left, lineY, right, lineY);
  });

  // Carrier row
  writer.drawText(left + mm(2), carrierTop - mm(4.5), 7, 'DELIVERED BY');
  writer.drawText(right - mm(30), carrierTop - mm(4.2), 12, limitText(provider, 22));

  // Meta row: FROM | DATE/WEIGHT | PARCEL
  const metaCol1 = left + contentWidth * 0.48;
  const metaCol2 = left + contentWidth * 0.77;
  writer.drawLine(metaCol1, metaTop, metaCol1, routeTop);
  writer.drawLine(metaCol2, metaTop, metaCol2, routeTop);
  writer.drawText(left + mm(1.8), metaTop - mm(4), 7, 'FROM');
  writer.drawText(left + mm(1.8), metaTop - mm(7.5), 9.5, limitText(data.businessName, 22));
  wrapText(returnAddress, 26).slice(0, 2).forEach((line, i) => {
    writer.drawText(left + mm(1.8), metaTop - mm(11) - i * mm(3), 7, line);
  });
  writer.drawText(metaCol1 + mm(1.8), metaTop - mm(4), 7, 'DATE');
  writer.drawText(metaCol1 + mm(1.8), metaTop - mm(7.5), 8, printDate);
  writer.drawText(metaCol1 + mm(1.8), metaTop - mm(11), 7, 'WEIGHT');
  writer.drawText(metaCol1 + mm(1.8), metaTop - mm(14.2), 8, '< 2 KG');
  const parcelBoxW = mm(15);
  const parcelBoxH = mm(10.5);
  const parcelBoxX = metaCol2 + (contentWidth * 0.23 - parcelBoxW) / 2;
  const parcelBoxY = (metaTop + routeTop) / 2 - parcelBoxH / 2;
  writer.drawRect(parcelBoxX, parcelBoxY, parcelBoxW, parcelBoxH);
  writer.fillRect(parcelBoxX, parcelBoxY + parcelBoxH - mm(3.8), parcelBoxW, mm(3.8));
  writer.drawText(parcelBoxX + mm(2), parcelBoxY + parcelBoxH - mm(2.9), 6.5, 'PARCEL', 'white');
  writer.drawText(parcelBoxX + mm(3), parcelBoxY + mm(2.5), 9, '1 OF 1');

  // Route row: state code + name
  const stateBoxW = mm(15);
  const stateBoxH = mm(6.5);
  writer.fillRect(left, (routeTop + recipientTop) / 2 - stateBoxH / 2, stateBoxW, stateBoxH);
  writer.drawText(left + mm(2), (routeTop + recipientTop) / 2 - mm(1.5), 15, stateCode || 'FYL', 'white');
  writer.drawText(left + stateBoxW + mm(2), (routeTop + recipientTop) / 2 + mm(1), 10.5, limitText(state.toUpperCase(), 22));
  writer.drawText(left + stateBoxW + mm(2), (routeTop + recipientTop) / 2 - mm(2.5), 8, 'NG');

  // Recipient row: ship-to + QR
  const qrSize = mm(19);
  const qrX = right - qrSize - mm(2);
  const qrY = (recipientTop + orderTop) / 2 - qrSize / 2 + mm(2);
  writer.drawRect(qrX, qrY, qrSize, qrSize);
  writer.drawQr(data.trackingUrl || primaryOrderNumber || data.orderNumber, qrX + mm(1), qrY + mm(1), qrSize - mm(2));
  wrapText('SCAN TO CONFIRM DELIVERY', 16).forEach((line, i) => {
    writer.drawText(qrX, qrY - mm(4) - i * mm(3), 6, line);
  });

  writer.drawText(left + mm(1.8), recipientTop - mm(4), 7, 'TO');
  writer.drawText(left + mm(1.8), recipientTop - mm(9), 14, limitText(data.customerName, 22));
  writer.drawText(left + mm(1.8), recipientTop - mm(13.5), 9, limitText(data.customerPhone, 22));
  wrapText(data.deliveryAddress, 34).slice(0, 3).forEach((line, i) => {
    writer.drawText(left + mm(1.8), recipientTop - mm(18) - i * mm(4.2), 8.5, line);
  });

  // Order details row (this row is only ~16.8mm tall — every offset below must fit inside
  // that or it bleeds into the RETURN TO row underneath it, which is what was happening).
  writer.drawText(left + contentWidth / 2 - mm(14), orderTop - mm(3.5), 7, 'ORDER DETAILS');
  const orderMid = left + contentWidth / 2;
  writer.drawLine(orderMid, orderTop - mm(5.5), orderMid, returnTop + mm(1.5));
  writer.drawText(left + mm(1.8), orderTop - mm(7.5), 7, 'ORDER NUMBER');
  writer.drawText(left + mm(1.8), orderTop - mm(11), 11, limitText(primaryOrderNumber, 18));
  if (hasWebsiteOrder) {
    writer.drawText(left + mm(1.8), orderTop - mm(14.5), 6, `REF: ${limitText(data.orderNumber, 20)}`);
  }
  writer.drawText(orderMid + mm(4), orderTop - mm(7.5), 7, 'TYPE');
  writer.drawText(orderMid + mm(4), orderTop - mm(11), 9, 'DISPATCH NIGERIA');

  // Return row
  const returnSplit = left + contentWidth * 0.57;
  writer.drawLine(returnSplit, returnTop, returnSplit, footerTop);
  writer.drawText(left + mm(1.8), returnTop - mm(4), 7, 'RETURN TO');
  writer.drawText(left + mm(1.8), returnTop - mm(7.5), 9, limitText(data.businessName, 24));
  wrapText(returnAddress, 30).slice(0, 2).forEach((line, i) => {
    writer.drawText(left + mm(1.8), returnTop - mm(11) - i * mm(3), 7, line);
  });
  if (data.businessPhone) {
    writer.drawText(left + mm(1.8), returnTop - mm(17), 7, data.businessPhone);
  }
  // The undelivered column is only ~43% of content width — "If undelivered, please return
  // to sender." at 7pt is far too long for a single line there, so it was overflowing clean
  // off the right edge of the label. Wrap it like every other text block.
  const undeliveredColWidth = right - (returnSplit + mm(2));
  const undeliveredMaxChars = Math.max(10, Math.floor(undeliveredColWidth / mm(1.5)));
  wrapText('If undelivered, please return to sender.', undeliveredMaxChars).slice(0, 2).forEach((line, i) => {
    writer.drawText(returnSplit + mm(2), returnTop - mm(4) - i * mm(3), 7, line);
  });
  writer.drawText(returnSplit + mm(2), returnTop - mm(12), 8, limitText(`${state}, Nigeria`, 24));
  writer.drawText(returnSplit + mm(2), returnTop - mm(15), 7, '100001');

  // Footer
  writer.drawText(left + mm(1.8), footerTop - mm(5), 6, limitText(`THANK YOU FOR SHOPPING WITH ${data.businessName.toUpperCase()}`, 44));
  writer.drawText(right - mm(28), footerTop - mm(5), 6, 'POWERED BY FYLL');
};

const buildPdfBytes = (
  items: OrderLabelData[],
  widthMm: number,
  heightMm: number,
): string => {
  const pageWidth = mm(widthMm);
  const pageHeight = mm(heightMm);
  const objects: string[] = ['', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontObjectId = 3;
  const pageObjectIds: number[] = [];

  items.forEach((item) => {
    const writer = createWriter();
    renderShippingLabelPage(writer, item, widthMm, heightMm);
    const stream = writer.lines.join('');
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    const pageId = addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageObjectIds.push(pageId);
  });

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return pdf;
};

const downloadPdfBlob = (pdfString: string, filename: string) => {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;

  const blob = new Blob([pdfString], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1200);
};

export interface InventoryLabelPdfData {
  sku: string;
  barcode: string;
  productName: string;
  variantName: string;
}

const renderInventoryLabelPage = (writer: PdfWriter, item: InventoryLabelPdfData, widthMm: number, heightMm: number) => {
  const width = mm(widthMm);
  const height = mm(heightMm);
  const codeText = item.barcode || item.sku;
  const isLandscape = widthMm >= heightMm;

  writer.drawRoundedRect(mm(1.5), mm(1.5), width - mm(3), height - mm(3), mm(1.5));

  const qrSize = mm(Math.max(14, Math.min((isLandscape ? heightMm : widthMm) - 8, 22)));
  const qrX = isLandscape ? mm(3.5) : (width - qrSize) / 2;
  const qrY = isLandscape ? (height - qrSize) / 2 : height - mm(3.5) - qrSize;
  writer.drawRect(qrX, qrY, qrSize, qrSize);
  writer.drawQr(codeText || item.productName, qrX + mm(0.5), qrY + mm(0.5), qrSize - mm(1));
  if (codeText) {
    writer.drawText(qrX, qrY - mm(3.5), 5.5, limitText(codeText, 22));
  }

  const textX = isLandscape ? qrX + qrSize + mm(3) : mm(3.5);
  const textTop = isLandscape ? height / 2 + mm(6) : qrY - mm(7);
  const safeName = [item.productName, item.variantName].filter(Boolean).join(' — ');
  const skuLines = wrapText(item.sku || codeText, 16).slice(0, 2);
  let cursorY = textTop;
  skuLines.forEach((line) => {
    writer.drawText(textX, cursorY, 10, line);
    cursorY -= mm(3.5);
  });
  cursorY -= mm(1);
  wrapText(safeName, 24).slice(0, 3).forEach((line) => {
    writer.drawText(textX, cursorY, 8, line);
    cursorY -= mm(3.2);
  });
};

const buildInventoryPdfBytes = (
  items: InventoryLabelPdfData[],
  widthMm: number,
  heightMm: number,
): string => {
  const pageWidth = mm(widthMm);
  const pageHeight = mm(heightMm);
  const objects: string[] = ['', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontObjectId = 3;
  const pageObjectIds: number[] = [];

  items.forEach((item) => {
    const writer = createWriter();
    renderInventoryLabelPage(writer, item, widthMm, heightMm);
    const stream = writer.lines.join('');
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    const pageId = addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageObjectIds.push(pageId);
  });

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return pdf;
};

export const downloadInventoryLabelPdf = (
  items: InventoryLabelPdfData[],
  widthMm: number,
  heightMm: number,
  filename: string,
) => {
  if (items.length === 0) return;
  downloadPdfBlob(buildInventoryPdfBytes(items, widthMm, heightMm), filename);
};

export const downloadShippingLabelPdf = (
  items: OrderLabelData[],
  widthMm: number,
  heightMm: number,
  filename: string,
) => {
  if (items.length === 0) return;
  downloadPdfBlob(buildPdfBytes(items, widthMm, heightMm), filename);
};
