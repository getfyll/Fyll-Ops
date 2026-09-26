type FyllCheckoutOrderCandidate = {
  id: string;
  source?: string;
  websiteOrderReference?: string;
  customerEmail?: string;
  customerPhone?: string;
  totalAmount: number;
  orderDate?: string;
  createdAt: string;
  fyllCheckout?: { reference?: string };
};

type WooOrderCandidate = {
  externalId: string;
  customerEmail: string;
  customerPhone: string;
  totalAmount: number;
  createdAt: string;
  metadataValues: string[];
};

const normalizeValue = (value: unknown) => (
  String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
);

const getDateKey = (value: string | undefined) => {
  const timestamp = new Date(value ?? '').getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : '';
};

const getSignature = (order: {
  customerEmail?: string;
  customerPhone?: string;
  totalAmount: number;
  createdAt?: string;
  orderDate?: string;
}) => {
  const contact = normalizeValue(order.customerEmail) || normalizeValue(order.customerPhone);
  const date = getDateKey(order.orderDate ?? order.createdAt);
  const amount = Math.round(Number(order.totalAmount) * 100);
  if (!contact || !date || !Number.isFinite(amount)) return '';
  return `${contact}:${amount}:${date}`;
};

const isMissingRealWooReference = (order: FyllCheckoutOrderCandidate) => {
  const source = order.source?.trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (source !== 'fyll checkout') return false;
  const websiteReference = order.websiteOrderReference?.trim() ?? '';
  const checkoutReference = order.fyllCheckout?.reference?.trim() ?? '';
  return !websiteReference
    || websiteReference.toLowerCase() === checkoutReference.toLowerCase()
    || /^FYL-/i.test(websiteReference);
};

export const matchWooOrdersForReferenceRepair = (
  wooOrders: WooOrderCandidate[],
  fyllOrders: FyllCheckoutOrderCandidate[],
) => {
  const targets = fyllOrders.filter(isMissingRealWooReference);
  const byCheckoutReference = new Map<string, FyllCheckoutOrderCandidate[]>();
  const bySignature = new Map<string, FyllCheckoutOrderCandidate[]>();
  const wooSignatureCounts = new Map<string, number>();

  targets.forEach((order) => {
    const checkoutReference = normalizeValue(order.fyllCheckout?.reference);
    if (checkoutReference) {
      byCheckoutReference.set(
        checkoutReference,
        [...(byCheckoutReference.get(checkoutReference) ?? []), order],
      );
    }
    const signature = getSignature(order);
    if (signature) bySignature.set(signature, [...(bySignature.get(signature) ?? []), order]);
  });

  wooOrders.forEach((order) => {
    const signature = getSignature(order);
    if (signature) wooSignatureCounts.set(signature, (wooSignatureCounts.get(signature) ?? 0) + 1);
  });

  const proposed = new Map<string, string>();
  const proposalCountsByOrder = new Map<string, number>();

  wooOrders.forEach((wooOrder) => {
    const metadataMatches = new Set(
      wooOrder.metadataValues
        .map(normalizeValue)
        .flatMap((value) => byCheckoutReference.get(value) ?? [])
        .map((order) => order.id),
    );
    let matchedOrderId = metadataMatches.size === 1 ? [...metadataMatches][0] : '';

    if (!matchedOrderId) {
      const signature = getSignature(wooOrder);
      const signatureMatches = signature ? bySignature.get(signature) ?? [] : [];
      if (signatureMatches.length === 1 && wooSignatureCounts.get(signature) === 1) {
        matchedOrderId = signatureMatches[0].id;
      }
    }

    if (!matchedOrderId) return;
    proposed.set(wooOrder.externalId, matchedOrderId);
    proposalCountsByOrder.set(matchedOrderId, (proposalCountsByOrder.get(matchedOrderId) ?? 0) + 1);
  });

  return new Map(
    [...proposed].filter(([, orderId]) => proposalCountsByOrder.get(orderId) === 1),
  );
};
