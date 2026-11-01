-- Reduce disk writes: drop duplicate indexes.
--
-- Many tables carry two or three identical indexes (for example orders has three on (id, business_id) and two on
-- (business_id)). Postgres updates every index on every write, so each duplicate multiplies the disk work for
-- nothing. This keeps one copy of each and never touches primary keys, unique constraints or unique indexes.
--
--  - An index is a duplicate when it is on the same table with the same columns, operator classes, expressions
--    and WHERE clause as another index.
--  - Only plain (non-unique, non-constraint) indexes are dropped.
--  - If a primary key or unique index already covers the same columns, every plain copy is dropped.
--  - Otherwise the plain copy that sorts first by name is kept and the rest are dropped.
--
-- Safe to run again: it only drops what is still a duplicate. Dropped indexes can be recreated at any time.

do $$
declare
  r record;
  dropped integer := 0;
begin
  for r in
    with idx as (
      select
        c.relname as tbl,
        i.relname as idx,
        x.indkey::text as cols,
        x.indclass::text as opclasses,
        coalesce(pg_get_expr(x.indpred, x.indrelid), '') as predicate,
        coalesce(pg_get_expr(x.indexprs, x.indrelid), '') as expressions,
        (x.indisunique or x.indisprimary or exists (select 1 from pg_constraint k where k.conindid = x.indexrelid)) as is_keeper
      from pg_index x
      join pg_class c on c.oid = x.indrelid
      join pg_class i on i.oid = x.indexrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and x.indisvalid
    ),
    grouped as (
      select
        idx.*,
        bool_or(is_keeper) over (partition by tbl, cols, opclasses, predicate, expressions) as group_has_keeper,
        row_number() over (partition by tbl, cols, opclasses, predicate, expressions, is_keeper order by idx) as position_in_kind,
        count(*) over (partition by tbl, cols, opclasses, predicate, expressions) as copies
      from idx
    )
    select tbl, idx
    from grouped
    where copies > 1
      and not is_keeper
      and (group_has_keeper or position_in_kind > 1)
    order by tbl, idx
  loop
    execute format('drop index if exists public.%I', r.idx);
    raise notice 'dropped duplicate index % on %', r.idx, r.tbl;
    dropped := dropped + 1;
  end loop;

  raise notice 'duplicate indexes dropped: %', dropped;
end;
$$;
