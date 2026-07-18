begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

-- Structure and privileges -------------------------------------------------

select has_function('public', 'searchable_text', array['text'], 'accent folding helper exists');
select has_function('public', 'search_public_catalog',
  array['text', 'text', 'integer', 'integer', 'boolean', 'text', 'integer', 'integer'],
  'catalog search function exists');
select has_function('public', 'count_public_catalog_by_category',
  array['text', 'integer', 'integer', 'boolean'],
  'catalog facet count function exists');
select has_index('public', 'products', 'products_public_search_trgm_idx', 'catalog search is backed by a trigram index');

select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('search_public_catalog', 'count_public_catalog_by_category') and p.prosecdef $$,
  $$ values (0::bigint) $$,
  'catalog search runs with invoker rights so RLS stays the outer boundary'
);
select results_eq(
  $$ select bool_and(has_function_privilege('anon', p.oid, 'EXECUTE')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('search_public_catalog', 'count_public_catalog_by_category') $$,
  $$ values (true) $$,
  'anonymous storefront sessions can execute catalog search'
);
select results_eq(
  $$ select bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('search_public_catalog', 'count_public_catalog_by_category') $$,
  $$ values (true) $$,
  'authenticated sessions can execute catalog search'
);
select results_eq(
  $$ select public.searchable_text('Ambré — ÉLÉGANT') $$,
  $$ values ('ambre — elegant'::text) $$,
  'search normalization folds case and accents'
);

-- Seed: one approved shop with two published products, one draft product and
-- one product missing approved media; a second approved shop for name search.

insert into auth.users (id, email, raw_user_meta_data) values
  ('60000000-0000-0000-0000-000000000001', 'search-seller@yaqeen.local', '{"display_name":"Search Seller"}'),
  ('60000000-0000-0000-0000-000000000002', 'search-operator@yaqeen.local', '{"display_name":"Search Operator"}'),
  ('60000000-0000-0000-0000-000000000003', 'search-seller-two@yaqeen.local', '{"display_name":"Search Seller Two"}');
update public.profiles set role = 'seller' where id in ('60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003');
update public.profiles set role = 'operator' where id = '60000000-0000-0000-0000-000000000002';

insert into public.shops (id, owner_id, slug, name, description, status, ships_from_country) values
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'maison-recherche', 'Maison Recherche', 'Boutique approuvée pour les tests de recherche.', 'approved', 'FR'),
  ('61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003', 'atelier-sabr-test', 'Atelier Sabr', 'Seconde boutique approuvée pour la recherche par vendeur.', 'approved', 'FR');
insert into public.shop_members (shop_id, user_id, member_role) values
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'owner'),
  ('61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003', 'owner');

insert into public.products (id, shop_id, slug, title, description, category, status, published_at) values
  ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'musc-leger', 'Musc léger', 'Un musc doux et poudré pour la journée.', 'parfums', 'published', now() - interval '2 days'),
  ('62000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000001', 'savon-royal', 'Savon royal', 'Savon surgras artisanal.', 'cosmetiques', 'published', now() - interval '1 day'),
  ('62000000-0000-0000-0000-000000000003', '61000000-0000-0000-0000-000000000001', 'brouillon-cache', 'Brouillon caché', 'Ne doit jamais sortir dans la recherche.', 'parfums', 'draft', null),
  ('62000000-0000-0000-0000-000000000004', '61000000-0000-0000-0000-000000000001', 'sans-media', 'Sans média', 'Publié mais sans média approuvé.', 'parfums', 'published', now()),
  ('62000000-0000-0000-0000-000000000005', '61000000-0000-0000-0000-000000000002', 'huile-argan', 'Huile précieuse', 'Huile pressée à froid.', 'bien-etre', 'published', now() - interval '3 days');

insert into public.product_variants (id, product_id, sku, title, price_cents, currency, stock_on_hand, stock_reserved, active) values
  ('63000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', 'SEARCH-MUSC-01', '50 ml', 3490, 'EUR', 10, 0, true),
  ('63000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000002', 'SEARCH-SAVON-01', '100 g', 890, 'EUR', 0, 0, true),
  ('63000000-0000-0000-0000-000000000003', '62000000-0000-0000-0000-000000000003', 'SEARCH-DRAFT-01', '50 ml', 2000, 'EUR', 5, 0, true),
  ('63000000-0000-0000-0000-000000000004', '62000000-0000-0000-0000-000000000004', 'SEARCH-NOMEDIA-01', '30 ml', 1500, 'EUR', 5, 0, true),
  ('63000000-0000-0000-0000-000000000005', '62000000-0000-0000-0000-000000000005', 'SEARCH-ARGAN-01', '30 ml', 2190, 'EUR', 3, 0, true);

insert into public.product_evidence (product_id, kind, status, scope, public_summary, submitted_by, reviewed_by, reviewed_at) values
  ('62000000-0000-0000-0000-000000000001', 'seller_declaration', 'approved', 'Composition sans alcool vérifiée sur déclaration.', 'Composition sans alcool vérifiée par la revue Yaqeen.', '60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', now()),
  ('62000000-0000-0000-0000-000000000002', 'seller_declaration', 'approved', 'Composition savon vérifiée sur déclaration.', 'Composition contrôlée par la revue Yaqeen.', '60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', now()),
  ('62000000-0000-0000-0000-000000000004', 'seller_declaration', 'approved', 'Preuve approuvée mais média manquant.', 'Preuve approuvée mais média manquant.', '60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', now()),
  ('62000000-0000-0000-0000-000000000005', 'seller_declaration', 'approved', 'Pression à froid documentée par le vendeur.', 'Origine documentée et revue par Yaqeen.', '60000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000002', now());

insert into public.product_media (product_id, storage_path, position, alt_text, mime_type, byte_size, width, height, status, submitted_by, reviewed_by, reviewed_at) values
  ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001/63000000-0000-0000-0000-0000000000a1.webp', 1, 'Flacon de musc léger', 'image/webp', 120000, 1200, 1200, 'approved', '60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', now()),
  ('62000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000001/63000000-0000-0000-0000-0000000000a2.webp', 1, 'Savon royal artisanal', 'image/webp', 120000, 1200, 1200, 'approved', '60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', now()),
  ('62000000-0000-0000-0000-000000000005', '61000000-0000-0000-0000-000000000002/63000000-0000-0000-0000-0000000000a5.webp', 1, 'Flacon d''huile précieuse', 'image/webp', 120000, 1200, 1200, 'approved', '60000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000002', now());

-- Behaviour ------------------------------------------------------------------

select results_eq(
  $$ select count(*)::bigint from public.search_public_catalog() $$,
  $$ values (3::bigint) $$,
  'only fully publishable products are searchable (draft and media-less excluded)'
);
select results_eq(
  $$ select distinct total_count from public.search_public_catalog() $$,
  $$ values (3::bigint) $$,
  'the window total matches the number of visible products'
);
select results_eq(
  $$ select product_id from public.search_public_catalog(requested_query => 'leger') $$,
  $$ values ('62000000-0000-0000-0000-000000000001'::uuid) $$,
  'accent-insensitive search matches « léger » from the unaccented query'
);
select results_eq(
  $$ select product_id from public.search_public_catalog(requested_query => 'MUSC') $$,
  $$ values ('62000000-0000-0000-0000-000000000001'::uuid) $$,
  'search is case-insensitive'
);
select results_eq(
  $$ select product_id from public.search_public_catalog(requested_query => 'sabr') $$,
  $$ values ('62000000-0000-0000-0000-000000000005'::uuid) $$,
  'search also matches the shop name'
);
select results_eq(
  $$ select product_id from public.search_public_catalog(requested_category => 'cosmetiques') $$,
  $$ values ('62000000-0000-0000-0000-000000000002'::uuid) $$,
  'category filter narrows results'
);
select results_eq(
  $$ select count(*)::bigint from public.search_public_catalog(requested_only_available => true) $$,
  $$ values (2::bigint) $$,
  'availability filter removes out-of-stock products'
);
select results_eq(
  $$ select count(*)::bigint from public.search_public_catalog(requested_min_cents => 2000, requested_max_cents => 3000) $$,
  $$ values (1::bigint) $$,
  'price range filters on the cheapest active variant'
);
select results_eq(
  $$ select product_id from public.search_public_catalog(requested_sort => 'prix-asc', requested_limit => 1) $$,
  $$ values ('62000000-0000-0000-0000-000000000002'::uuid) $$,
  'ascending price sort surfaces the cheapest product first'
);
select results_eq(
  $$ select product_id from public.search_public_catalog(requested_sort => 'prix-desc', requested_limit => 1) $$,
  $$ values ('62000000-0000-0000-0000-000000000001'::uuid) $$,
  'descending price sort surfaces the most expensive product first'
);
select results_eq(
  $$ select count(*)::bigint from public.search_public_catalog(requested_limit => 2, requested_offset => 2) $$,
  $$ values (1::bigint) $$,
  'offset pagination returns the remaining page'
);
select results_eq(
  $$ select count(*)::bigint from public.search_public_catalog(requested_limit => 100000) $$,
  $$ values (3::bigint) $$,
  'page size is capped without erroring on oversized requests'
);
select results_eq(
  $$ select total from public.count_public_catalog_by_category() where category = 'parfums' $$,
  $$ values (1::bigint) $$,
  'facet counts exclude non-publishable parfum products'
);
select results_eq(
  $$ select count(*)::bigint from public.count_public_catalog_by_category() $$,
  $$ values (3::bigint) $$,
  'facet counts cover exactly the categories with visible products'
);

-- Anonymous execution path (invoker rights + RLS) -----------------------------

set local role anon;
select results_eq(
  $$ select count(*)::bigint from public.search_public_catalog() $$,
  $$ values (3::bigint) $$,
  'anonymous visitors get the same audited catalog through RLS'
);
select is_empty(
  $$ select product_id from public.search_public_catalog(requested_query => 'brouillon') $$,
  'anonymous search never leaks draft products'
);
reset role;

select * from finish();
rollback;
