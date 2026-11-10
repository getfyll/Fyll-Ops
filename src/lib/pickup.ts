// Customer pickup (collection), shared with the Fyll Store.
//
// Both apps use the same Supabase project, so there is one configuration and one way to mark an order:
//   - Settings: businesses.data.pickupSettings (edited in the Store dashboard and in Ops Settings → Pickup).
//   - Order marker: a pickup order carries fulfillmentMethod 'pickup' (Ops), fulfillmentType 'pickup' and
//     shippingOptionId 'pickup' (Store), plus a snapshot of the settings in pickupDetails.
// Always use isPickupOrder() to read an order: any one of the three markers means pickup.

export type PickupSettings = {
  enabled: boolean;
  country: string;
  states: string[];
  locationName: string;
  areaName: string;
  fullAddress: string;
  contactName: string;
  contactPhone: string;
  days: string[];
  startTime: string; // 24h "HH:MM"
  endTime: string;
  instructions?: string;
};

export const EMPTY_PICKUP_SETTINGS: PickupSettings = {
  enabled: false,
  country: 'Nigeria',
  states: [],
  locationName: '',
  areaName: '',
  fullAddress: '',
  contactName: '',
  contactPhone: '',
  days: [],
  startTime: '09:00',
  endTime: '17:00',
  instructions: '',
};

export const PICKUP_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export const PICKUP_TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? '00' : '30';
  return `${String(hour).padStart(2, '0')}:${minute}`;
});

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const textList = (value: unknown): string[] => (
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
);

// Reads whatever is stored in businesses.data.pickupSettings (or an order's pickupDetails) into the full shape.
export const normalizePickupSettings = (raw: unknown): PickupSettings => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_PICKUP_SETTINGS };
  const source = raw as Record<string, unknown>;
  return {
    enabled: source.enabled === true,
    country: text(source.country) || EMPTY_PICKUP_SETTINGS.country,
    states: textList(source.states),
    locationName: text(source.locationName),
    areaName: text(source.areaName),
    fullAddress: text(source.fullAddress),
    contactName: text(source.contactName),
    contactPhone: text(source.contactPhone),
    days: textList(source.days),
    startTime: text(source.startTime) || EMPTY_PICKUP_SETTINGS.startTime,
    endTime: text(source.endTime) || EMPTY_PICKUP_SETTINGS.endTime,
    instructions: text(source.instructions),
  };
};

export const hasPickupContent = (pickup: PickupSettings): boolean => Boolean(
  pickup.locationName.trim() || pickup.areaName.trim() || pickup.fullAddress.trim()
  || pickup.contactName.trim() || pickup.contactPhone.trim() || pickup.days.length
);

// What has to be filled in before pickup can be switched on (the same list the Store asks for).
export const getMissingPickupFields = (pickup: PickupSettings): string[] => [
  !pickup.locationName.trim() ? 'location name' : '',
  !pickup.areaName.trim() ? 'checkout area' : '',
  !pickup.fullAddress.trim() ? 'full address' : '',
  !pickup.contactName.trim() ? 'contact name' : '',
  !pickup.contactPhone.trim() ? 'contact number' : '',
  pickup.days.length === 0 ? 'pickup day' : '',
  pickup.states.length === 0 ? 'state' : '',
  !pickup.startTime.trim() ? 'start time' : '',
  !pickup.endTime.trim() ? 'end time' : '',
].filter(Boolean);

export const formatPickupTime = (value: string): string => {
  const [hourText, minute = '00'] = value.split(':');
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return value;
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${minute} ${period}`;
};

// "Monday, Tuesday · 9:00 AM–5:00 PM"
export const formatPickupHours = (pickup: Pick<PickupSettings, 'days' | 'startTime' | 'endTime'>): string => {
  const days = pickup.days.join(', ');
  const hours = pickup.startTime && pickup.endTime ? `${formatPickupTime(pickup.startTime)}–${formatPickupTime(pickup.endTime)}` : '';
  return [days, hours].filter(Boolean).join(' · ');
};

// The Store offers pickup at checkout through a delivery zone with the id 'pickup'. Saving pickup settings has to keep
// that zone in step with them (add or refresh it when pickup is on, remove it when off), exactly like the Store does.
type DeliveryZoneLike = { id?: string; [key: string]: unknown };
export const withPickupTransportZone = (zones: unknown, pickup: PickupSettings): DeliveryZoneLike[] => {
  const others = (Array.isArray(zones) ? (zones as DeliveryZoneLike[]) : []).filter((zone) => zone?.id !== 'pickup');
  if (!pickup.enabled) return others;
  return [
    ...others,
    {
      id: 'pickup',
      country: pickup.country || 'Nigeria',
      name: pickup.locationName || 'Customer pickup',
      states: pickup.states,
      cities: pickup.states,
      amount: 0,
      timeline: formatPickupHours(pickup),
      feeCollectedBy: 'free',
      requireRiderFeeAck: false,
    },
  ];
};

// ---------------------------------------------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------------------------------------------

export type PickupMarkerFields = {
  fulfillmentMethod?: string | null;
  fulfillmentType?: string | null;
  shippingOptionId?: string | null;
};

// The one place that decides whether an order is a pickup order. Any of the three markers counts.
export const isPickupOrder = (order: PickupMarkerFields | null | undefined): boolean => Boolean(
  order && (order.fulfillmentMethod === 'pickup' || order.fulfillmentType === 'pickup' || order.shippingOptionId === 'pickup')
);

// What every Ops pickup order writes, so the Store's tracking page, emails and database trigger recognise it too.
export const PICKUP_ORDER_MARKERS = {
  fulfillmentMethod: 'pickup',
  fulfillmentType: 'pickup',
  shippingOptionId: 'pickup',
} as const;

// A pickup order's snapshot of the settings (kept on the order so it does not change if the settings are edited later).
// `enabled: true` is set on purpose: the Store's database trigger refuses a snapshot that is not enabled, and an order
// created by staff in Ops is a real pickup even when the public Store pickup option is switched off.
export const buildPickupDetails = (settings: PickupSettings): PickupSettings => ({ ...settings, enabled: true });

// ---------------------------------------------------------------------------------------------------------------
// Statuses (the Store reads statuses by name and stage; these names must keep matching).
// ---------------------------------------------------------------------------------------------------------------

export const READY_FOR_PICKUP_STATUS_PATTERN = /ready.*pick[ -]?up/i;
export const COLLECTED_STATUS_PATTERN = /collected|collection/i;

export const isReadyForPickupStatusName = (name?: string | null): boolean => READY_FOR_PICKUP_STATUS_PATTERN.test(name ?? '');
export const isCollectedStatusName = (name?: string | null): boolean => COLLECTED_STATUS_PATTERN.test(name ?? '');

// Whether a status should be offered for an order. Statuses with no `appliesTo` are for every order. The status an order
// is already on is always kept, so a wrongly-set order never ends up showing a blank status.
export const orderStatusAppliesToOrder = (
  status: { name: string; appliesTo?: 'delivery' | 'pickup' | null },
  orderIsPickup: boolean,
  currentStatusName?: string | null
): boolean => {
  if (!status.appliesTo) return true;
  if (currentStatusName && status.name === currentStatusName) return true;
  return status.appliesTo === (orderIsPickup ? 'pickup' : 'delivery');
};
