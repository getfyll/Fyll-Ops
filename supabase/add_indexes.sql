-- ==================================================================
-- ADD INDEXES FOR PERFORMANCE
-- This adds critical indexes to speed up queries
-- ==================================================================
-- Run this in Supabase SQL Editor to dramatically improve performance

-- Products table indexes
CREATE INDEX IF NOT EXISTS idx_products_business_id ON public.products(business_id);
CREATE INDEX IF NOT EXISTS idx_products_id_business_id ON public.products(id, business_id);
CREATE INDEX IF NOT EXISTS idx_products_business_updated_desc ON public.products(business_id, updated_at DESC);

-- Orders table indexes
CREATE INDEX IF NOT EXISTS idx_orders_business_id ON public.orders(business_id);
CREATE INDEX IF NOT EXISTS idx_orders_id_business_id ON public.orders(id, business_id);
CREATE INDEX IF NOT EXISTS idx_orders_business_updated_desc ON public.orders(business_id, updated_at DESC);

-- Customers table indexes
CREATE INDEX IF NOT EXISTS idx_customers_business_id ON public.customers(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_id_business_id ON public.customers(id, business_id);
CREATE INDEX IF NOT EXISTS idx_customers_business_updated_desc ON public.customers(business_id, updated_at DESC);

-- Cases table indexes
CREATE INDEX IF NOT EXISTS idx_cases_business_id ON public.cases(business_id);
CREATE INDEX IF NOT EXISTS idx_cases_id_business_id ON public.cases(id, business_id);
CREATE INDEX IF NOT EXISTS idx_cases_business_updated_desc ON public.cases(business_id, updated_at DESC);

-- Product categories indexes
CREATE INDEX IF NOT EXISTS idx_product_categories_business_id ON public.product_categories(business_id);

-- Product variables indexes
CREATE INDEX IF NOT EXISTS idx_product_variables_business_id ON public.product_variables(business_id);

-- Business settings indexes
CREATE INDEX IF NOT EXISTS idx_business_settings_business_id ON public.business_settings(business_id);

-- Order statuses indexes
CREATE INDEX IF NOT EXISTS idx_order_statuses_business_id ON public.order_statuses(business_id);

-- Sale sources indexes
CREATE INDEX IF NOT EXISTS idx_sale_sources_business_id ON public.sale_sources(business_id);

-- Custom services indexes
CREATE INDEX IF NOT EXISTS idx_custom_services_business_id ON public.custom_services(business_id);

-- Payment methods indexes
CREATE INDEX IF NOT EXISTS idx_payment_methods_business_id ON public.payment_methods(business_id);

-- Logistics carriers indexes
CREATE INDEX IF NOT EXISTS idx_logistics_carriers_business_id ON public.logistics_carriers(business_id);

-- Expense categories indexes
CREATE INDEX IF NOT EXISTS idx_expense_categories_business_id ON public.expense_categories(business_id);

-- Restock logs indexes
CREATE INDEX IF NOT EXISTS idx_restock_logs_business_id ON public.restock_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_restock_logs_business_updated_desc ON public.restock_logs(business_id, updated_at DESC);

-- ==================================================================
-- ANALYZE TABLES TO UPDATE QUERY PLANNER STATISTICS
-- ==================================================================
ANALYZE public.products;
ANALYZE public.orders;
ANALYZE public.customers;
ANALYZE public.product_categories;
ANALYZE public.product_variables;
ANALYZE public.business_settings;
ANALYZE public.order_statuses;
ANALYZE public.sale_sources;
ANALYZE public.custom_services;
ANALYZE public.payment_methods;
ANALYZE public.logistics_carriers;
ANALYZE public.expense_categories;
ANALYZE public.restock_logs;
ANALYZE public.cases;

-- ==================================================================
-- DONE! Queries should now use indexes instead of sequential scans
-- ==================================================================
-- After running this:
-- 1. Check query performance - should be much faster
-- 2. No more statement timeouts
-- 3. Queries will use index scans instead of sequential scans
