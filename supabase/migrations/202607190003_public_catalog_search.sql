-- Public catalog search executed in SQL so the storefront no longer loads the
-- whole catalog into application memory. Accent-insensitive matching, category
-- and price facets, availability filter, stable sorts and capped pagination.
-- Both functions run with invoker rights: RLS remains the outer boundary and
-- the explicit publication gates below stay aligned with the storefront DAL.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- unaccent(regdictionary, text) is stable because the dictionary is resolved
-- at call time; with the dictionary pinned it is deterministic, which this
-- immutable wrapper asserts so the expression can back a GIN index.
create or replace function public.searchable_text(input text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(input, '')));
$$;

revoke all on function public.searchable_text(text) from public;
grant execute on function public.searchable_text(text) to anon, authenticated;

create index products_public_search_trgm_idx
  on public.products
  using gin (public.searchable_text(title || ' ' || coalesce(description, '')) extensions.gin_trgm_ops);

create or replace function public.search_public_catalog(
  requested_query text default null,
  requested_category text default null,
  requested_min_cents integer default null,
  requested_max_cents integer default null,
  requested_only_available boolean default false,
  requested_sort text default 'selection',
  requested_limit integer default 24,
  requested_offset integer default 0
)
returns table (product_id uuid, total_count bigint)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select
      least(greatest(coalesce(requested_limit, 24), 1), 48) as page_size,
      least(greatest(coalesce(requested_offset, 0), 0), 100000) as page_offset,
      nullif(public.searchable_text(requested_query), '') as needle,
      nullif(lower(trim(requested_category)), '') as category_filter,
      case when requested_sort in ('selection', 'prix-asc', 'prix-desc') then requested_sort else 'selection' end as sort_key
  ),
  visible as (
    select p.id, p.published_at, pricing.min_price_cents
    from public.products p
    join public.shops s on s.id = p.shop_id and s.status = 'approved'
    cross join bounds b
    cross join lateral (
      select min(pv.price_cents) as min_price_cents
      from public.product_variants pv
      where pv.product_id = p.id
        and pv.active
        and pv.price_cents > 0
        and (not coalesce(requested_only_available, false)
             or pv.stock_on_hand - pv.stock_reserved > 0)
    ) pricing
    where p.status = 'published'
      and pricing.min_price_cents is not null
      and (b.category_filter is null or p.category = b.category_filter)
      and (requested_min_cents is null or pricing.min_price_cents >= requested_min_cents)
      and (requested_max_cents is null or pricing.min_price_cents <= requested_max_cents)
      and exists (
        select 1 from public.product_evidence e
        where e.product_id = p.id and e.status = 'approved' and e.public_summary is not null
      )
      and exists (
        select 1 from public.product_media m
        where m.product_id = p.id and m.status = 'approved'
      )
      and (
        b.needle is null
        or public.searchable_text(p.title || ' ' || coalesce(p.description, '')) like '%' || b.needle || '%'
        or public.searchable_text(s.name) like '%' || b.needle || '%'
      )
  )
  select v.id as product_id, count(*) over () as total_count
  from visible v
  cross join bounds b
  order by
    case when b.sort_key = 'prix-asc' then v.min_price_cents end asc,
    case when b.sort_key = 'prix-desc' then v.min_price_cents end desc,
    v.published_at desc nulls last,
    v.id
  limit (select page_size from bounds)
  offset (select page_offset from bounds);
$$;

create or replace function public.count_public_catalog_by_category(
  requested_query text default null,
  requested_min_cents integer default null,
  requested_max_cents integer default null,
  requested_only_available boolean default false
)
returns table (category text, total bigint)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select nullif(public.searchable_text(requested_query), '') as needle
  )
  select p.category, count(*)::bigint as total
  from public.products p
  join public.shops s on s.id = p.shop_id and s.status = 'approved'
  cross join bounds b
  cross join lateral (
    select min(pv.price_cents) as min_price_cents
    from public.product_variants pv
    where pv.product_id = p.id
      and pv.active
      and pv.price_cents > 0
      and (not coalesce(requested_only_available, false)
           or pv.stock_on_hand - pv.stock_reserved > 0)
  ) pricing
  where p.status = 'published'
    and pricing.min_price_cents is not null
    and (requested_min_cents is null or pricing.min_price_cents >= requested_min_cents)
    and (requested_max_cents is null or pricing.min_price_cents <= requested_max_cents)
    and exists (
      select 1 from public.product_evidence e
      where e.product_id = p.id and e.status = 'approved' and e.public_summary is not null
    )
    and exists (
      select 1 from public.product_media m
      where m.product_id = p.id and m.status = 'approved'
    )
    and (
      b.needle is null
      or public.searchable_text(p.title || ' ' || coalesce(p.description, '')) like '%' || b.needle || '%'
      or public.searchable_text(s.name) like '%' || b.needle || '%'
    )
  group by p.category;
$$;

revoke all on function public.search_public_catalog(text, text, integer, integer, boolean, text, integer, integer) from public;
revoke all on function public.count_public_catalog_by_category(text, integer, integer, boolean) from public;
grant execute on function public.search_public_catalog(text, text, integer, integer, boolean, text, integer, integer) to anon, authenticated;
grant execute on function public.count_public_catalog_by_category(text, integer, integer, boolean) to anon, authenticated;
