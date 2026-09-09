# Changelog

## 2026-02-28

### Added

1. Web desktop right-side stats panel on Service Detail (`/services/[id]`) with cards for:
   - Status (with active/inactive toggle)
   - Total Services
   - Most Booked Options
   - Revenue Generated

### Changed

1. Improved tablet web sizing for the Service Detail right rail:
   - Tablet threshold expanded to `width < 1366`
   - Smaller right rail width, gaps, card padding, typography, and icon sizing
   - Reduced heading letter spacing for readability
2. Standardized right-rail card padding across all cards.

### Validation

1. `npm run typecheck` passed
2. `npm run test:threads-smoke` passed (6 checks)
3. `npm run build:web` passed and exported static web bundle
