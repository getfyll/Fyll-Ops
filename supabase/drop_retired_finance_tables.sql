-- Retire legacy finance data tables that are no longer used by FYLL.
-- Safe to run multiple times.

BEGIN;

DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.procurements CASCADE;

COMMIT;

-- Verification
SELECT
  to_regclass('public.expenses') AS expenses_table,
  to_regclass('public.procurements') AS procurements_table;
