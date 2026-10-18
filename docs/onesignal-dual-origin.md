# OneSignal dual-origin rollout

Fyll serves both `https://fyll.app` and `https://www.fyll.app`. Browsers treat
these as separate origins, so each origin requires its own OneSignal Web Push
configuration and its own subscriber list.

## OneSignal dashboard

Keep the existing OneSignal web app for `https://www.fyll.app`. Create a second
Web Push app whose exact Site URL is `https://fyll.app` and whose default launch
URL is also on `https://fyll.app`.

Use the same icons and permission-prompt wording for both apps. Do not reuse the
same App ID for both Site URLs.

## Vercel variables

Add these production and preview variables:

```text
EXPO_PUBLIC_ONESIGNAL_FYLL_APP_ID=
EXPO_PUBLIC_ONESIGNAL_FYLL_SAFARI_WEB_ID=
EXPO_PUBLIC_ONESIGNAL_WWW_APP_ID=
EXPO_PUBLIC_ONESIGNAL_WWW_SAFARI_WEB_ID=

FYLL_ONESIGNAL_APP_ID=
FYLL_ONESIGNAL_REST_API_KEY=
WWW_ONESIGNAL_APP_ID=
WWW_ONESIGNAL_REST_API_KEY=
```

The existing `EXPO_PUBLIC_ONESIGNAL_APP_ID`,
`EXPO_PUBLIC_ONESIGNAL_SAFARI_WEB_ID`, `ONESIGNAL_APP_ID`, and
`ONESIGNAL_REST_API_KEY` remain fallbacks for `www.fyll.app` during migration.

## Supabase Edge Function secrets

Set these secrets for the notification Edge Functions:

```text
FYLL_ONESIGNAL_APP_ID=
FYLL_ONESIGNAL_REST_API_KEY=
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
