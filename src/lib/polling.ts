// How often the app re-checks the server in the background (milliseconds).
//
// Orders, cases, customers, products and the other synced tables already update live over the realtime connection
// (see useSupabaseSync). These intervals only cover data that is NOT live-synced, so they can be slow. Every poll is
// a database request, and a small database runs out of disk budget quickly when each open tab polls every few
// seconds. Polling pauses on its own while the tab or app is in the background.
export const POLL_MS = {
  // Unread counts and thread lists (also pushed to phones as notifications).
  badges: 60_000,
  // The Home bell list (new notifications also arrive live on Home).
  notifications: 45_000,
  // Payments and Social Checkout links: not live-synced, but staff are also alerted by push and WhatsApp.
  payments: 45_000,
  quotes: 60_000,
  // A second copy of the orders list on the Payments page. Orders already stream live, so this is only a safety net.
  ordersCopy: 5 * 60_000,
} as const;
