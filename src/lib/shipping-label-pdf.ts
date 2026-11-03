import { getLabelFlags, getRowHeightsMm, getStateInfo, getWeightText } from '@/lib/shipping-label-options';
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
  drawText: (x: number, y: number, size: number, text: string, color?: 'black' | 'white', font?: 'F1' | 'F2' | 'F3') => void;
  drawLine: (x1: number, y1: number, x2: number, y2: number) => void;
  drawRect: (x: number, y: number, w: number, h: number) => void;
  drawRoundedRect: (x: number, y: number, w: number, h: number, radius: number) => void;
  fillRect: (x: number, y: number, w: number, h: number, color?: 'black' | 'white') => void;
  drawQr: (value: string, x: number, y: number, size: number) => void;
};

const createWriter = (): PdfWriter => {
  const lines: string[] = ['0.75 w\n'];

  const drawText: PdfWriter['drawText'] = (x, y, size, text, color = 'black', font = 'F1') => {
    const rg = color === 'white' ? '1 1 1 rg' : '0 0 0 rg';
    lines.push(`${rg}\nBT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(text)}) Tj ET\n0 0 0 rg\n`);
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

// Helvetica is the only face available in a hand-built PDF, so weights come from Helvetica-Bold (F2) and the order number
// uses Courier-Bold (F3). Text widths are estimated from the point size.
const textWidth = (text: string, size: number, factor = 0.58) => text.length * size * factor;

const renderShippingLabelPage = (writer: PdfWriter, data: OrderLabelData, widthMm: number, heightMm: number) => {
  const flags = getLabelFlags(data);
  const rows = getRowHeightsMm(heightMm, flags);
  const width = mm(widthMm);
  const height = mm(heightMm);
  const hasWebsiteOrder = !!data.websiteOrderRef;
  const primaryOrderNumber = hasWebsiteOrder ? data.websiteOrderRef! : data.orderNumber;
  const { name: stateName, code: stateCode } = getStateInfo(data.deliveryAddress);
  const provider = data.logisticsProvider || 'Delivery Partner';
  const returnAddress = data.returnAddress || 'Return address not set';
  const printDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const parcelText = flags.parcelText.replace(' OF ', '/');

  const left = mm(2.5);
  const right = width - mm(2.5);
  const contentWidth = right - left;
  const outerTop = height - mm(2);
  const outerBottom = mm(2);
  const usableHeight = outerTop - outerBottom;
  // The rows were sized for the page height minus its margins; scale them to the label rectangle drawn here.
  const rowTotal = rows.header + rows.recipient + rows.order + rows.ret + rows.footer;
  const scale = usableHeight / mm(rowTotal);
  const hHeader = mm(rows.header) * scale;
  const hRecipient = mm(rows.recipient) * scale;
  const hOrder = mm(rows.order) * scale;
  const hReturn = mm(rows.ret) * scale;

  writer.drawRoundedRect(left, outerBottom, contentWidth, usableHeight, mm(2.5));

  const headerTop = outerTop;
  const recipientTop = headerTop - hHeader;
  const orderTop = recipientTop - hRecipient;
  const returnTop = orderTop - hOrder;
  const footerTop = returnTop - hReturn;
  [recipientTop, orderTop, returnTop, footerTop].forEach((lineY, index) => {
    if (index === 2 && !flags.ret) return; // no return block, no line for it
    writer.drawLine(left, lineY, right, lineY);
  });

  // ---- Header: zone block | carrier | parcel ----
  const zoneW = mm(30);
  const parcelW = mm(18.5);
  writer.fillRect(left, recipientTop, zoneW, hHeader);
  const zoneMid = headerTop - hHeader / 2;
  writer.drawText(left + zoneW / 2 - textWidth(stateCode, 28, 0.62) / 2, zoneMid - mm(1.5), 28, stateCode, 'white', 'F2');
  const zoneLabel = limitText(`ZONE - ${stateName.toUpperCase()}`, 18);
  writer.drawText(left + zoneW / 2 - textWidth(zoneLabel, 6.3, 0.6) / 2, zoneMid - mm(8.5), 6.3, zoneLabel, 'white', 'F2');

  const carrierX = left + zoneW + mm(3.5);
  writer.drawText(carrierX, zoneMid + mm(7), 5.6, 'DELIVERED BY', 'black', 'F2');
  writer.drawText(carrierX, zoneMid + mm(1.2), 12.6, limitText(provider, 22), 'black', 'F2');
  writer.drawText(carrierX, zoneMid - mm(4), 7.8, limitText(`Dispatch Nigeria - ${printDate}`, 34));

  const parcelX = right - parcelW;
  writer.drawLine(parcelX, headerTop, parcelX, recipientTop);
  const parcelMid = parcelX + parcelW / 2;
  writer.drawText(parcelMid - textWidth('PARCEL', 5.6, 0.62) / 2, zoneMid + mm(7), 5.6, 'PARCEL', 'black', 'F2');
  writer.drawText(parcelMid - textWidth(parcelText, 15.5, 0.6) / 2, zoneMid - mm(1.5), 15.5, parcelText, 'black', 'F2');
  const weightText = getWeightText(data);
  writer.drawText(parcelMid - textWidth(weightText, 6.3, 0.6) / 2, zoneMid - mm(5.5), 6.3, weightText, 'black', 'F2');

  // ---- Recipient: ship to + delivery QR ----
  const textX = left + mm(4);
  const qrColumn = flags.qr ? mm(30) : 0;
  const textWidthPt = contentWidth - mm(4) - mm(4) - qrColumn;
  let cursor = recipientTop - mm(7);
  writer.drawText(textX, cursor, 5.6, 'SHIP TO', 'black', 'F2');
  cursor -= mm(6.5);
  wrapText(data.customerName, Math.max(8, Math.floor(textWidthPt / (18 * 0.6)))).slice(0, 2).forEach((line) => {
    writer.drawText(textX, cursor, 18, line, 'black', 'F2');
    cursor -= mm(6.6);
  });
  if (flags.phone && data.customerPhone) {
    cursor -= mm(0.5);
    writer.drawText(textX, cursor, 12, limitText(data.customerPhone, 24), 'black', 'F2');
    cursor -= mm(5.5);
  }
  cursor -= mm(0.5);
  wrapText(data.deliveryAddress, Math.max(14, Math.floor(textWidthPt / (9.9 * 0.5)))).slice(0, 4).forEach((line) => {
    writer.drawText(textX, cursor, 9.9, line);
    cursor -= mm(4.6);
  });
  if (flags.qr) {
    const qrSize = mm(24);
    const qrX = right - mm(4) - qrSize - mm(1);
    const qrY = (recipientTop + orderTop) / 2 - qrSize / 2 + mm(2);
    writer.drawQr(data.trackingUrl || primaryOrderNumber || data.orderNumber, qrX, qrY, qrSize);
    ['SCAN TO CONFIRM', 'DELIVERY'].forEach((line, i) => {
      writer.drawText(qrX + qrSize / 2 - textWidth(line, 5.6, 0.6) / 2, qrY - mm(3.5) - i * mm(2.6), 5.6, line, 'black', 'F2');
    });
  }

  // ---- Order number + items ----
  writer.drawText(textX, orderTop - mm(5.2), 5.6, 'ORDER', 'black', 'F2');
  writer.drawText(textX, orderTop - mm(10.8), 15.5, limitText(primaryOrderNumber, 16), 'black', 'F3');
  if (hasWebsiteOrder) {
    writer.drawText(textX, orderTop - mm(13.2), 5.6, `REF: ${limitText(data.orderNumber, 24)}`);
  }
  if (typeof data.itemCount === 'number') {
    const itemsText = String(data.itemCount);
    writer.drawText(right - mm(4) - textWidth('ITEMS', 5.6, 0.62), orderTop - mm(5.2), 5.6, 'ITEMS', 'black', 'F2');
    writer.drawText(right - mm(4) - textWidth(itemsText, 10.5, 0.6), orderTop - mm(10.2), 10.5, itemsText, 'black', 'F2');
  }

  // ---- From / return to ----
  if (flags.ret) {
    writer.drawText(textX, returnTop - mm(5), 5.6, 'FROM / RETURN TO', 'black', 'F2');
    writer.drawText(textX, returnTop - mm(9.2), 8.4, limitText(`${data.businessName}${data.businessPhone ? ` - ${data.businessPhone}` : ''}`, 54), 'black', 'F2');
    const returnWidthPt = contentWidth - mm(8);
    wrapText(`${returnAddress}. If undelivered, please return to sender.`, Math.max(20, Math.floor(returnWidthPt / (7.4 * 0.5)))).slice(0, 3).forEach((line, i) => {
      writer.drawText(textX, returnTop - mm(13) - i * mm(3.2), 7.4, line);
    });
  }

  // ---- Footer ----
  if (flags.thanks) {
    writer.drawText(textX, footerTop - mm(4.8), 6.3, limitText(`THANK YOU FOR SHOPPING WITH ${data.businessName.toUpperCase()}`, 44), 'black', 'F2');
  }
  writer.drawText(right - mm(4) - textWidth('POWERED BY FYLL', 6.3, 0.6), footerTop - mm(4.8), 6.3, 'POWERED BY FYLL', 'black', 'F2');
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
  const boldFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const monoFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>');
  const pageObjectIds: number[] = [];

  items.forEach((item) => {
    const writer = createWriter();
    renderShippingLabelPage(writer, item, widthMm, heightMm);
    const stream = writer.lines.join('');
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    const pageId = addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R /F2 ${boldFontId} 0 R /F3 ${monoFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
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

// Rough text widths for the built-in PDF fonts (no font metrics are available here), as a share of the font size.
const CHAR_WIDTH = { F1: 0.54, F2: 0.6, F3: 0.62 } as const;
const PT_TO_MM = 1 / MM_TO_PT;

// Breaks a word-less string (a barcode or SKU) into pieces that fit.
const chunkText = (value: string, maxChars: number): string[] => {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += Math.max(1, maxChars)) chunks.push(value.slice(index, index + Math.max(1, maxChars)));
  return chunks.length > 0 ? chunks : [''];
};

type TextBlock = { text: string; size: number; font: 'F1' | 'F2' | 'F3'; gapBefore: number };

// The product label in the same arrangement as the printed one: a rounded border, the QR code on the left (no frame),
// and on the right the product name, the variant and the code, all kept inside the border.
const renderInventoryLabelPage = (writer: PdfWriter, item: InventoryLabelPdfData, widthMm: number, heightMm: number) => {
  const codeText = item.barcode || item.sku;
  const isLandscape = widthMm >= heightMm;
  const borderInset = 1.3;
  const padding = 2;

  writer.drawRoundedRect(mm(borderInset), mm(borderInset), mm(widthMm - borderInset * 2), mm(heightMm - borderInset * 2), mm(1.5));

  const innerLeft = borderInset + padding;
  const innerRight = widthMm - borderInset - padding;
  const innerTop = heightMm - borderInset - padding;
  const innerBottom = borderInset + padding;
  const qrMm = isLandscape ? Math.max(14, Math.min(heightMm - 8, 22)) : Math.max(14, Math.min(widthMm - 8, 24));
  const quietMm = 0.8;

  const qrLeft = isLandscape ? innerLeft : (widthMm - qrMm) / 2;
  const qrBottom = isLandscape ? (heightMm - qrMm) / 2 : innerTop - qrMm;
  writer.drawQr(codeText || item.productName, mm(qrLeft + quietMm), mm(qrBottom + quietMm), mm(qrMm - quietMm * 2));

  // Text area: beside the QR (landscape) or under it (portrait).
  const textLeft = isLandscape ? qrLeft + qrMm + 2.2 : innerLeft;
  const textWidth = Math.max(8, innerRight - textLeft);
  const titleSize = widthMm >= 50 ? 10 : 8.5;
  // The SKU and the barcode number each get their own line, so a number is never split in the middle.
  const codeLines = [item.sku && item.sku !== codeText ? item.sku : '', codeText].filter(Boolean);

  const fits = (font: 'F1' | 'F2' | 'F3', size: number) => Math.max(3, Math.floor(textWidth / (CHAR_WIDTH[font] * size * PT_TO_MM)));
  const blocks: TextBlock[] = [];
  // Picks the largest size at which the text fits in `maxLines` lines; if even the smallest does not, it is shortened
  // with "..." so nothing runs outside the label.
  const fitText = (text: string, font: 'F1' | 'F2' | 'F3', sizes: number[], maxLines: number) => {
    for (const size of sizes) {
      const perLine = fits(font, size);
      const lines = wrapText(text, perLine);
      if (lines.length <= maxLines && lines.every((line) => line.length <= perLine)) return { size, lines };
    }
    const size = sizes[sizes.length - 1];
    const perLine = fits(font, size);
    const lines = wrapText(text, perLine).slice(0, maxLines).map((line) => limitText(line, perLine));
    const last = lines.length - 1;
    if (last >= 0) lines[last] = `${limitText(lines[last], Math.max(1, perLine - 3)).trimEnd()}...`;
    return { size, lines };
  };
  const title = fitText(item.productName || item.sku || codeText, 'F2', [titleSize, 8.5, 7.5, 6.5], 2);
  title.lines.forEach((line) => blocks.push({ text: line, size: title.size, font: 'F2', gapBefore: 0 }));
  if (item.variantName) {
    const variant = fitText(item.variantName, 'F2', [7.5, 6.5, 6], 2);
    variant.lines.forEach((line, index) => blocks.push({ text: line, size: variant.size, font: 'F2', gapBefore: index === 0 ? 0.8 : 0 }));
  }
  codeLines.slice(0, 2).forEach((codeLine, index) => {
    blocks.push({ text: limitText(codeLine, fits('F3', 5.5)), size: 5.5, font: 'F3', gapBefore: index === 0 ? 1 : 0 });
  });

  const lineHeight = (size: number) => size * PT_TO_MM * 1.2;
  const totalHeight = blocks.reduce((sum, block) => sum + block.gapBefore + lineHeight(block.size), 0);
  // Landscape: centred beside the QR. Portrait: starts right under it, but never below the border.
  let cursorTop = isLandscape ? heightMm / 2 + totalHeight / 2 : Math.min(qrBottom - 1.5, innerTop);
  if (!isLandscape && cursorTop - totalHeight < innerBottom) cursorTop = innerBottom + totalHeight;

  blocks.forEach((block) => {
    cursorTop -= block.gapBefore;
    const lineH = lineHeight(block.size);
    const baseline = cursorTop - block.size * PT_TO_MM * 0.9;
    const estimated = block.text.length * CHAR_WIDTH[block.font] * block.size * PT_TO_MM;
    const x = isLandscape ? textLeft : textLeft + Math.max(0, (textWidth - estimated) / 2);
    writer.drawText(mm(x), mm(baseline), block.size, block.text, 'black', block.font);
    cursorTop -= lineH;
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
  const boldFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const monoFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>');
  const pageObjectIds: number[] = [];

  items.forEach((item) => {
    const writer = createWriter();
    renderInventoryLabelPage(writer, item, widthMm, heightMm);
    const stream = writer.lines.join('');
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    const pageId = addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R /F2 ${boldFontId} 0 R /F3 ${monoFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
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
