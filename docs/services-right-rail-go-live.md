# Services Right-Rail Go-Live Notes

Date: 2026-02-28
Owner: Product Engineering
Area: `src/app/(tabs)/services/[id].tsx`

## Scope

This release adds a desktop web right-side stats panel to Service Detail, modeled after Inventory detail side cards, and tightens tablet-scale typography/layout.

Included cards:

1. `Status` with active/inactive toggle
2. `Total Services` with most-booked options summary
3. `Revenue Generated` with all-time booking count

## What Changed

1. Added web desktop right rail layout for services detail route.
2. Added service status toggle integration using `updateProduct(...)`.
3. Added derived metrics from store data:
   - `totalServices` from products with `productType === service`
   - `serviceStats.totalBookings` and `serviceStats.totalRevenue` from order lines
   - `serviceStats.topOptions` from selected service variable values
4. Added responsive tablet-down scaling for right rail:
   - Tablet trigger: `isWebDesktop && width < 1366`
   - Reduced rail width, gaps, padding, icon sizes, and text sizes
   - Reduced heading letter spacing for tablet readability
5. Kept right rail web-only to avoid mobile UI regressions.

## Validation Completed

Automated checks run on 2026-02-28:

1. `npm run typecheck` -> pass
2. `npm run test:threads-smoke` -> pass (`6 checks`)
3. `npm run build:web` -> pass (`Exported: dist`)

## Manual Visual QA Checklist

Status: ready for run

Desktop Web:

1. Open `/services/[id]` at `1440px+` and confirm right rail appears with 3 cards.
2. Confirm right rail does not overlap left form content.
3. Toggle status switch and verify badge + persistence after refresh.
4. Confirm total services count matches Services list count.
5. Confirm revenue/booking numbers render without overflow for large values.

Tablet Web:

1. Test `1365px`, `1280px`, `1180px`, `1024px`.
2. Confirm typography is smaller than desktop and remains legible.
3. Confirm card spacing/padding remains consistent across all 3 cards.
4. Confirm heading labels are not overly spaced.
5. Confirm long option labels truncate cleanly without layout break.

General:

1. Verify no console errors on render and toggle.
2. Verify route still saves service edits normally.
3. Verify no regression in thread screens and thread info panel navigation.

## Risks / Follow-ups

1. Metrics currently depend on existing order line structure and status labels; if order status taxonomy changes, metric filters should be revisited.
2. No dedicated component test yet for right-rail metric derivation.
3. Optional next hardening: extract right-rail cards into a dedicated `ServiceStatsRail` component for easier test coverage.
