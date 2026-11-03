// What can be switched on or off on a shipping label, and how many parcels it is for. Shared by the on-screen preview,
// the printed HTML, the queue and the PDF so they all behave the same way.
export type ShippingLabelOptionFields = {
  showPhone?: boolean;
  showQr?: boolean;
  showReturn?: boolean;
  showThanks?: boolean;
  parcelNumber?: number;
  parcelCount?: number;
  // Parcel weight in kg as typed (for example "2.5"). Empty means the default "< 2 KG".
  weightKg?: string;
};

export type ShippingLabelFlags = {
  phone: boolean;
  qr: boolean;
  ret: boolean;
  thanks: boolean;
  parcelText: string;
};

// What the label prints for the parcel weight.
export const getWeightText = (data: { weightKg?: string }): string => {
  const value = (data.weightKg ?? '').replace(/[^0-9.]/g, '').slice(0, 6);
  return value && /\d/.test(value) ? `${value} KG` : '< 2 KG';
};

// Everything is on unless it was turned off.
export const getLabelFlags = (data: ShippingLabelOptionFields): ShippingLabelFlags => {
  const count = Math.max(1, Math.floor(data.parcelCount ?? 1));
  const number = Math.min(count, Math.max(1, Math.floor(data.parcelNumber ?? 1)));
  return {
    phone: data.showPhone !== false,
    qr: data.showQr !== false,
    ret: data.showReturn !== false,
    thanks: data.showThanks !== false,
    parcelText: `${number} OF ${count}`,
  };
};

// Heights of the label's rows in mm, from the label's height. The recipient row takes whatever is left, so hiding the
// return block makes it taller instead of leaving a gap.
export const getRowHeightsMm = (heightMm: number, flags: ShippingLabelFlags) => {
  const usable = Math.max(heightMm - 5, 20);
  const header = usable * 0.165;
  const order = usable * 0.095;
  const ret = flags.ret ? usable * 0.125 : 0;
  const footer = usable * 0.052;
  return { header, order, ret, footer, recipient: usable - header - order - ret - footer };
};

// The state a parcel is going to, and the short zone code shown big at the top of the label.
export const getStateInfo = (deliveryAddress: string): { name: string; code: string } => {
  const parts = (deliveryAddress ?? '').split(',').map((part) => part.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  const name = last.replace(/\d+/g, '').replace(/\bstate\b/i, '').replace(/\s+/g, ' ').trim() || 'Nigeria';
  const letters = name.replace(/[^a-z]/gi, '').toUpperCase();
  const code = /abuja|fct|federal capital/i.test(name) ? 'FCT' : (letters.slice(0, 3) || 'NG');
  return { name, code };
};

export const MAX_PARCELS = 9;

// One entry per parcel, numbered 1 of N, for printing.
export const expandParcels = <T extends ShippingLabelOptionFields>(data: T): T[] => {
  const count = Math.max(1, Math.min(MAX_PARCELS, Math.floor(data.parcelCount ?? 1)));
  return Array.from({ length: count }, (_, index) => ({ ...data, parcelNumber: index + 1, parcelCount: count }));
};

// The name a saved or downloaded shipping label gets: "Customer-Name-ORD-123-fyll-print-label".
export const getShippingLabelFileBase = (data: { customerName?: string; orderNumber: string }): string => {
  const clean = (value: string) => value.replace(/[\\/:*?"<>|]+/g, ' ').trim().replace(/\s+/g, '-');
  const parts = [clean(data.customerName ?? ''), clean(data.orderNumber), 'fyll-print-label'].filter(Boolean);
  return parts.join('-');
};
