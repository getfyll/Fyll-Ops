import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Haptics from 'expo-haptics';
import { generateOrderLabelHTML, OrderLabelData } from '@/components/labels/OrderLabel80x90';
import { buildDeliveryConfirmationHostUrl } from '@/lib/tracking-url';
import { downloadShippingLabelPdf } from '@/lib/shipping-label-pdf';
import { printHtmlOnWeb } from '@/lib/print-html-web';

export interface ShippingLabelSize {
  widthMm: number;
  heightMm: number;
}

export const SHIPPING_LABEL_SIZE_PRESETS: {
  id: string;
  label: string;
  size: ShippingLabelSize;
}[] = [
  { id: '4x6', label: '4x6 in (100x150mm)', size: { widthMm: 100, heightMm: 150 } },
];

/**
 * Print shipping label for an order using the selected label size.
 * Opens the device's native print dialog
 */
export async function printOrderLabel(
  data: OrderLabelData,
  labelSize: ShippingLabelSize = { widthMm: 100, heightMm: 150 },
  options?: { isDesktop?: boolean },
): Promise<boolean> {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const html = generateOrderLabelHTML(data, labelSize);

    if (Platform.OS === 'web' && options?.isDesktop) {
      // Desktop browsers' print dialog renders this correctly via a hidden iframe — keep
      // that path since it gives desktop users the native "print or save as PDF" dialog
      // directly, which is a nicer flow than forcing a silent file download.
      await printHtmlOnWeb(html);
      return true;
    }

    if (Platform.OS === 'web') {
      // Both Print.printAsync({ html }) and printing via an iframe's window.print() have
      // proven unreliable on mobile web in this environment — observed printing the
      // top-level app screen instead of the isolated label, on both iOS Safari and Android
      // Chrome. Downloading the PDF directly sidesteps browser print dialogs entirely.
      const dateStamp = new Date().toISOString().slice(0, 10);
      downloadShippingLabelPdf([data], labelSize.widthMm, labelSize.heightMm, `fyll-shipping-label-${data.orderNumber}-${dateStamp}.pdf`);
      return true;
    }

    const mmToPoints = (mm: number) => Math.round(mm * 2.83465);
    await Print.printAsync({
      html,
      width: mmToPoints(labelSize.widthMm),
      height: mmToPoints(labelSize.heightMm),
    });

    return true;
  } catch (error) {
    console.log('Print error:', error);
    return false;
  }
}

interface BusinessInfo {
  businessName: string;
  businessSlug?: string;
  businessLogo: string | null;
  businessPhone: string;
  businessWebsite: string;
  returnAddress: string;
}

/**
 * Prepare order label data from an order object
 */
export function prepareOrderLabelData(
  order: {
    orderNumber: string;
    customerTrackingCode?: string;
    websiteOrderReference?: string;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    deliveryAddress?: string;
    deliveryState?: string;
    logistics?: {
      carrierName?: string;
    };
  },
  business: BusinessInfo
): OrderLabelData {
  // Combine address with state
  const fullAddress = [order.deliveryAddress, order.deliveryState]
    .filter(Boolean)
    .join(', ');
  const trackingCode = order.customerTrackingCode || order.websiteOrderReference || order.orderNumber;
  // QR code links to the one-tap delivery confirmation page rather than order tracking —
  // customers already get the tracking link by email, so the scan on the physical label
  // is more useful as "confirm you received this" for the courier/recipient moment.
  const trackingUrl = order.customerEmail && trackingCode
    ? buildDeliveryConfirmationHostUrl({
      businessName: business.businessName,
      businessSlug: business.businessSlug,
      trackingCode,
      email: order.customerEmail,
    })
    : undefined;

  return {
    businessName: business.businessName,
    businessLogo: business.businessLogo,
    businessPhone: business.businessPhone,
    businessWebsite: business.businessWebsite,
    returnAddress: business.returnAddress,
    trackingUrl,
    orderNumber: order.orderNumber,
    websiteOrderRef: order.websiteOrderReference,
    customerName: order.customerName,
    customerPhone: order.customerPhone || '',
    deliveryAddress: fullAddress,
    logisticsProvider: order.logistics?.carrierName,
  };
}
