# AI Import Test Files

Use these CSV files to test the new AI Import Assistant.

## Files

1. `orders-woocommerce-sample.csv`
- Typical order export with grouped multi-line orders.

2. `customers-sample.csv`
- Customer list with name, email, phone, and address fields.

3. `products-sample.csv`
- Product rows with variants by color.

4. `expenses-sample.csv`
- Expense rows with date/category/supplier/type fields.

5. `auto-detect-mixed-headers-orders.csv`
- Deliberately mixed header names to test AI auto-detect + mapping.

## Recommended test flow

1. Open `Settings -> Data -> AI Import Assistant`.
2. Pick one import type (or `Auto-detect File`).
3. Upload one file above.
4. Confirm detected type + mapping.
5. Check parse preview and run import.
