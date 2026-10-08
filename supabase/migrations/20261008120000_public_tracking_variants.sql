-- Public order tracking: return each ordered product's variants (id, name, photo).
--
-- The tracking page showed the product's base name and photo for every order line because the
-- lookup only returned { id, name, imageUrl } per product. With the variants included, the page
-- can show the variant that was actually ordered (for example "Jade") and its own thumbnail.
--
-- Patches the LIVE lookup_public_order_tracking() in place so any live-only differences from the
-- migration history are kept. Safe to run more than once.

do $$
declare
  fn_def text;
  old_snippet constant text := $q$'imageUrl', nullif(coalesce(p.data->>'imageUrl', ''), '')$q$;
  new_snippet constant text := $q$'imageUrl', nullif(coalesce(p.data->>'imageUrl', ''), ''),
        'variants', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', v->>'id',
              'name', coalesce(
                nullif(btrim((
                  select string_agg(e.value, ' / ' order by e.key)
                  from jsonb_each_text(
                    case when jsonb_typeof(v->'variableValues') = 'object' then v->'variableValues' else '{}'::jsonb end
                  ) e
                )), ''),
                nullif(v->>'sku', ''),
                ''
              ),
              'imageUrl', nullif(coalesce(v->>'imageUrl', ''), '')
            )
          )
          from jsonb_array_elements(
            case when jsonb_typeof(p.data->'variants') = 'array' then p.data->'variants' else '[]'::jsonb end
          ) v
          -- only the variants that were actually ordered
          where v->>'id' in (
            select item->>'variantId'
            from jsonb_array_elements(coalesce(matched_order.data->'items', '[]'::jsonb)) item
            where coalesce(item->>'productId', '') = p.id
          )
        ), '[]'::jsonb)$q$;
begin
  select pg_get_functiondef(f.oid) into fn_def
  from pg_proc f
  join pg_namespace n on n.oid = f.pronamespace
  where n.nspname = 'public' and f.proname = 'lookup_public_order_tracking';

  if fn_def is null then
    raise exception 'lookup_public_order_tracking() not found';
  end if;

  if position($q$'variants'$q$ in fn_def) > 0 then
    raise notice 'lookup_public_order_tracking() already returns variants; nothing to do.';
    return;
  end if;

  if position(old_snippet in fn_def) = 0 then
    raise exception 'Could not find the products payload in lookup_public_order_tracking(); not patching.';
  end if;

  execute replace(fn_def, old_snippet, new_snippet);
end $$;

-- Upgrade a copy patched by the first version of this migration (all variants) to ordered-only.
do $$
declare
  fn_def text;
  all_variants constant text := $q$          from jsonb_array_elements(
            case when jsonb_typeof(p.data->'variants') = 'array' then p.data->'variants' else '[]'::jsonb end
          ) v
        ), '[]'::jsonb)$q$;
  ordered_only constant text := $q$          from jsonb_array_elements(
            case when jsonb_typeof(p.data->'variants') = 'array' then p.data->'variants' else '[]'::jsonb end
          ) v
          -- only the variants that were actually ordered
          where v->>'id' in (
            select item->>'variantId'
            from jsonb_array_elements(coalesce(matched_order.data->'items', '[]'::jsonb)) item
            where coalesce(item->>'productId', '') = p.id
          )
        ), '[]'::jsonb)$q$;
begin
  select pg_get_functiondef(f.oid) into fn_def
  from pg_proc f
  join pg_namespace n on n.oid = f.pronamespace
  where n.nspname = 'public' and f.proname = 'lookup_public_order_tracking';

  if fn_def is not null
     and position('only the variants that were actually ordered' in fn_def) = 0
     and position(all_variants in fn_def) > 0 then
    execute replace(fn_def, all_variants, ordered_only);
  end if;
end $$;
