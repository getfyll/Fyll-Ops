# OneSignal multi-origin rollout

Fyll's authenticated application lives at `https://dashboard.fyll.app`. The
existing FYLL OneSignal Web Push app was moved from `https://fyll.app` to the
dashboard origin as part of that migration. Browsers treat these as separate
origins, so subscriptions created on the old origin do not move automatically.

## OneSignal dashboard

The FYLL web app's exact Site URL and default launch URL must both be
`https://dashboard.fyll.app`. Users who subscribed on `fyll.app` must grant
notification permission again on the dashboard; OneSignal cannot transfer a
browser push subscription between origins.

If notifications are later needed on `fyll.app` or `www.fyll.app` as well,
create a separate OneSignal Web Push app for each origin. One App ID must not be
used on multiple origins at the same time.

## Vercel variables

Add these production and preview variables:

```text
EXPO_PUBLIC_ONESIGNAL_FYLL_APP_ID=
EXPO_PUBLIC_ONESIGNAL_FYLL_SAFARI_WEB_ID=
EXPO_PUBLIC_ONESIGNAL_DASHBOARD_APP_ID=
EXPO_PUBLIC_ONESIGNAL_DASHBOARD_SAFARI_WEB_ID=
EXPO_PUBLIC_ONESIGNAL_WWW_APP_ID=
EXPO_PUBLIC_ONESIGNAL_WWW_SAFARI_WEB_ID=

FYLL_ONESIGNAL_APP_ID=
FYLL_ONESIGNAL_REST_API_KEY=
DASHBOARD_ONESIGNAL_APP_ID=
DASHBOARD_ONESIGNAL_REST_API_KEY=
WWW_ONESIGNAL_APP_ID=
WWW_ONESIGNAL_REST_API_KEY=
```

The dashboard variables are optional during the migration. When absent, the
application deliberately falls back to the existing `FYLL_*` values because
that OneSignal app is now configured for `dashboard.fyll.app`.

The existing `EXPO_PUBLIC_ONESIGNAL_APP_ID`,
`EXPO_PUBLIC_ONESIGNAL_SAFARI_WEB_ID`, `ONESIGNAL_APP_ID`, and
`ONESIGNAL_REST_API_KEY` remain fallbacks for `www.fyll.app` during migration.

## Supabase Edge Function secrets

Set these secrets for the notification Edge Functions:

```text
FYLL_ONESIGNAL_APP_ID=
FYLL_ONESIGNAL_REST_API_KEY=
DASHBOARD_ONESIGNAL_APP_ID=
DASHBOARD_ONESIGNAL_REST_API_KEY=
WWW_ONESIGNAL_APP_ID=
WWW_ONESIGNAL_REST_API_KEY=
```

Then redeploy these functions:

```text
send-thread-notification
send-return-email
send-delivery-followup
send-social-checkout-email
```

They send main-app web push through every configured, unique OneSignal app.
`send-thread-notification` also continues sending native mobile push through
Expo.

## Verification

Test each origin in a separate browser profile or device:

1. Sign in and click **Enable notifications** in the in-app prompt.
2. Confirm browser permission is `granted`.
3. Open `/debug-info` and refresh the OneSignal state.
4. Verify an External ID, Subscription ID, `user_id`, and `business_id` exist.
5. Send a direct subscription test.
6. Confirm the subscription appears under the matching OneSignal app only.
7. Test an installed PWA from each origin while the PWA is closed.

On iPhone/iPad, web push requires iOS/iPadOS 16.4 or later and the site must be
installed on the Home Screen before the permission prompt can subscribe it.
