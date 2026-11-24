// QR code helpers for Fyll Pay QR. The encoder in ./vendor is Kazuhiko Arase's MIT-licensed
// "QRCode for JavaScript" (as shipped in qrcode-terminal), copied in so no new package is needed.
// It encodes bytes with charCodeAt, so keep payloads ASCII (Fyll Pay links always are).

// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require('./vendor/index.js') as new (typeNumber: number, level: number) => {
  addData: (data: string) => void;
  make: () => void;
  getModuleCount: () => number;
  isDark: (row: number, col: number) => boolean;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRErrorCorrectLevel = require('./vendor/QRErrorCorrectLevel.js') as { L: number; M: number; Q: number; H: number };

export type QrMatrix = boolean[][];

export const buildQrMatrix = (text: string, level: 'L' | 'M' | 'Q' | 'H' = 'M'): QrMatrix => {
  const qr = new QRCode(-1, QRErrorCorrectLevel[level]);
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  const rows: QrMatrix = [];
  for (let r = 0; r < size; r += 1) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c += 1) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
};

export const isFinderModule = (row: number, col: number, size: number) =>
  (row < 7 && col < 7) || (row < 7 && col >= size - 7) || (row >= size - 7 && col < 7);

export const QR_QUIET_ZONE = 4;

// All data modules (finder squares excluded) as one path of unit squares in module coordinates.
// Drawn as a single crisp shape, so there are no hairline seams or blurred edges between squares.
export const qrModulesPath = (matrix: QrMatrix) => {
  const n = matrix.length;
  const z = QR_QUIET_ZONE;
  const d: string[] = [];
  for (let r = 0; r < n; r += 1) {
    let c = 0;
    while (c < n) {
      if (!matrix[r][c] || isFinderModule(r, c, n)) { c += 1; continue; }
      let run = 1;
      while (c + run < n && matrix[r][c + run] && !isFinderModule(r, c + run, n)) run += 1;
      d.push(`M${c + z} ${r + z}h${run}v1h-${run}z`);
      c += run;
    }
  }
  return d.join('');
};

const finderSvg = (matrix: QrMatrix, color: string) => {
  const n = matrix.length;
  const z = QR_QUIET_ZONE;
  return [[0, 0], [0, n - 7], [n - 7, 0]].map(([r, c]) => {
    const x = c + z;
    const y = r + z;
    return `<rect x="${x}" y="${y}" width="7" height="7" rx="1.6" fill="${color}"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="1.1" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.8" fill="${color}"/>`;
  }).join('');
};

// Standalone QR SVG for printing and saving. Whole pixels per module keep it sharp.
export const qrSvgString = (matrix: QrMatrix, color = '#141414', pixelsPerModule = 12) => {
  const total = matrix.length + QR_QUIET_ZONE * 2;
  const px = total * Math.max(1, Math.round(pixelsPerModule));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${qrModulesPath(matrix)}" fill="${color}"/><g shape-rendering="geometricPrecision">${finderSvg(matrix, color)}</g></svg>`;
};
