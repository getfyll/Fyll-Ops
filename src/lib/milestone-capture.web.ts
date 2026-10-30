import { Asset } from 'expo-asset';
import { STORY_HEIGHT, STORY_WIDTH, type MilestoneStorySpec } from '@/components/milestones/MilestoneStoryCard';

// Web: the Story card is drawn straight onto a 1080x1920 canvas. (Copying the page's text layout, as screenshot
// libraries do, loses spaces and dots in some browsers.) Mirrors MilestoneStoryCard. Returns a PNG data URI.
const fieldAsset = require('../../assets/fyll-field-phone.jpg');
const wordmarkAsset = require('../../assets/fyll-wordmark-thick-light.png');

const LIME = '#d5e057';
const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const DISPLAY_800 = 'BricolageGrotesque_800ExtraBold, "Helvetica Neue", Arial, sans-serif';
const DISPLAY_700 = 'BricolageGrotesque_700Bold, "Helvetica Neue", Arial, sans-serif';

const loadImage = (uri: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const image = new (globalThis as any).Image() as HTMLImageElement;
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = uri;
  });

const assetUri = (asset: unknown) => (typeof asset === 'string' ? asset : Asset.fromModule(asset as number).uri);

// Letter by letter, so tight or wide tracking works in every browser.
const spacedText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) => {
  let cursor = x;
  for (const char of text) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + spacing;
  }
  return cursor;
};

const wrapLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const roundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

export const captureStoryImage = async (_target: unknown, spec: MilestoneStorySpec): Promise<string> => {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  await Promise.all([
    fonts?.load(`44px BricolageGrotesque_700Bold`),
    fonts?.load(`440px BricolageGrotesque_800ExtraBold`),
  ]).catch(() => undefined);

  const [field, wordmark, logo] = await Promise.all([
    loadImage(assetUri(fieldAsset)),
    loadImage(assetUri(wordmarkAsset)),
    spec.businessLogo ? loadImage(spec.businessLogo) : Promise.resolve(null),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');
  ctx.textBaseline = 'alphabetic';

  // Background: the lime field with the same dark fade as the card.
  ctx.fillStyle = '#3f4a08';
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  if (field) ctx.drawImage(field, 0, 0, STORY_WIDTH, STORY_HEIGHT);
  const fade = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT);
  fade.addColorStop(0, 'rgba(20,20,20,0.35)');
  fade.addColorStop(0.35, 'rgba(20,20,20,0.15)');
  fade.addColorStop(1, 'rgba(20,20,20,0.75)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  // Header: the logo on the left, the name and date centred against it.
  const circleX = 88;
  const circleY = 112;
  const diameter = 120;
  const centerY = circleY + diameter / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(circleX + diameter / 2, centerY, diameter / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#1e1e1e';
  ctx.fill();
  ctx.clip();
  if (logo) {
    ctx.drawImage(logo, circleX, circleY, diameter, diameter);
  } else {
    ctx.fillStyle = LIME;
    ctx.font = `56px ${DISPLAY_800}`;
    ctx.textAlign = 'center';
    ctx.fillText(spec.businessName.trim().charAt(0).toUpperCase() || 'F', circleX + diameter / 2, centerY + 20);
    ctx.textAlign = 'left';
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(circleX + diameter / 2, centerY, diameter / 2 - 3, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = LIME;
  ctx.stroke();

  const textX = circleX + diameter + 28;
  ctx.fillStyle = '#f4f4ef';
  ctx.font = `44px ${DISPLAY_700}`;
  let name = spec.businessName;
  while (name.length > 1 && ctx.measureText(name).width > STORY_WIDTH - textX - 88) name = name.slice(0, -1);
  if (name !== spec.businessName) name = `${name.trimEnd()}…`;
  ctx.fillText(name, textX, centerY - 6);
  ctx.fillStyle = 'rgba(244,244,239,0.8)';
  ctx.font = `30px ${SYSTEM_FONT}`;
  ctx.fillText(spec.dateLabel, textX, centerY + 38);

  // Middle: label, number, "orders", thank-you line and the optional storefront address, centred as one block.
  const number = spec.milestone.toLocaleString('en-US');
  const numberSize = number.length > 4 ? 300 : 440;
  const numberSpacing = number.length > 4 ? -10 : -16;
  ctx.font = `42px ${SYSTEM_FONT}`;
  const thanks = wrapLines(ctx, 'Thank you to every one of you who ordered. This is yours too.', 800);
  const blockHeight = 565 + 62 * thanks.length + (spec.storefrontUrl ? 120 : 0);
  const top = 980 - blockHeight / 2;

  ctx.fillStyle = '#eef2c4';
  ctx.font = `36px ${DISPLAY_700}`;
  spacedText(ctx, 'WE JUST HIT', 88, top + 38, 7);

  const numberBaseline = top + 400 + (numberSize === 300 ? -60 : 0);
  ctx.fillStyle = LIME;
  ctx.font = `${numberSize}px ${DISPLAY_800}`;
  spacedText(ctx, number, 88, numberBaseline, numberSpacing);

  const ordersBaseline = numberBaseline + 125;
  ctx.fillStyle = '#ffffff';
  ctx.font = `128px ${DISPLAY_800}`;
  spacedText(ctx, 'orders', 88, ordersBaseline, -4);

  ctx.fillStyle = 'rgba(244,244,239,0.92)';
  ctx.font = `42px ${SYSTEM_FONT}`;
  const firstLine = ordersBaseline + 71 + 14;
  thanks.forEach((line, index) => ctx.fillText(line, 88, firstLine + index * 62));

  if (spec.storefrontUrl) {
    ctx.font = `500 36px ${SYSTEM_FONT}`;
    const width = ctx.measureText(spec.storefrontUrl).width + 72;
    const pillTop = firstLine + (thanks.length - 1) * 62 + 31 + 36;
    roundedRect(ctx, 88, pillTop, width, 84, 42);
    ctx.fillStyle = 'rgba(20,20,20,0.45)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(213,224,87,0.6)';
    ctx.stroke();
    ctx.fillStyle = '#f4f4ef';
    ctx.fillText(spec.storefrontUrl, 88 + 36, pillTop + 54);
  }

  // Footer: "Powered by fyll" pill and the address.
  const footerTop = STORY_HEIGHT - 112 - 88;
  ctx.font = `28px ${SYSTEM_FONT}`;
  const poweredWidth = ctx.measureText('Powered by').width;
  const wordmarkWidth = 88;
  const pillWidth = 36 + poweredWidth + 20 + wordmarkWidth + 36;
  roundedRect(ctx, 88, footerTop, pillWidth, 88, 44);
  ctx.fillStyle = 'rgba(20,20,20,0.45)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(244,244,239,0.85)';
  ctx.fillText('Powered by', 88 + 36, footerTop + 54);
  if (wordmark) ctx.drawImage(wordmark, 88 + 36 + poweredWidth + 20, footerTop + 20, wordmarkWidth, 48);

  ctx.fillStyle = 'rgba(244,244,239,0.75)';
  ctx.font = `30px ${SYSTEM_FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('fyll.app', STORY_WIDTH - 88, footerTop + 54);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
};
