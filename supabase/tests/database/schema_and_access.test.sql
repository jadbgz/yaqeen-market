begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(32);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'shops', 'shops table exists');
select has_table('public', 'shop_members', 'shop_members table exists');
select has_table('public', 'products', 'products table exists');
select has_table('public', 'product_variants', 'product_variants table exists');
select has_table('public', 'product_evidence', 'product_evidence table exists');

select results_eq(
  $$
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('profiles', 'shops', 'shop_members', 'products', 'product_variants', 'product_evidence')
      and c.relrowsecurity
  $$,
  $$ values (6::bigint) $$,
  'RLS is enabled on every exposed domain table'
);

select policies_are('public', 'profiles', array[
  'profiles_self_select', 'profiles_self_update'
]);
select policies_are('public', 'shops', array[
  'shops_public_read', 'shops_owner_insert', 'shops_member_update'
]);
select policies_are('public', 'shop_members', array[
  'shop_members_member_read', 'shop_members_owner_insert'
]);
select policies_are('public', 'products', array[
  'products_public_read', 'products_member_write'
]);
select policies_are('public', 'product_variants', array[
  'variants_public_read', 'variants_member_write'
]);
select policies_are('public', 'product_evidence', array[
  'evidence_public_read', 'evidence_member_submit'
]);

select has_index('public', 'products', 'products_shop_status_idx', 'product review queries have a shop/status index');
select has_index('public', 'product_variants', 'variants_product_active_idx', 'active variant queries have a product index');
select has_index('public', 'product_evidence', 'evidence_product_status_idx', 'evidence review queries have a product/status index');
select has_index('public', 'shops', 'shops_owner_unique_idx', 'an account can own only one shop during the initial release');

select results_eq(
  $$ select has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') $$,
  $$ values (false) $$,
  'customers cannot promote their own profile role'
);
select results_eq(
  $$ select has_column_privilege('authenticated', 'public.shops', 'status', 'UPDATE') $$,
  $$ values (false) $$,
  'shop members cannot approve their own shop'
);
select results_eq(
  $$ select has_column_privilege('authenticated', 'public.products', 'status', 'UPDATE') $$,
  $$ values (false) $$,
  'shop members cannot publish their own product'
);
select results_eq(
  $$ select has_column_privilege('authenticated', 'public.product_evidence', 'status', 'UPDATE') $$,
  $$ values (false) $$,
  'submitters cannot approve their own evidence'
);
select results_eq(
  $$ select has_table_privilege('anon', 'public.products', 'INSERT') $$,
  $$ values (false) $$,
  'anonymous visitors cannot create products'
);

select col_not_null('public', 'product_variants', 'stock_on_hand', 'physical stock cannot be null');
select col_not_null('public', 'product_variants', 'stock_reserved', 'reserved stock cannot be null');

select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_seller_shop' $$,
  $$ values (1::bigint) $$,
  'seller onboarding function exists'
);
select results_eq(
  $$ select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_seller_shop' $$,
  $$ values (true) $$,
  'seller onboarding is an audited security-definer boundary'
);
select results_eq(
  $$ select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_seller_shop' $$,
  $$ values (false) $$,
  'anonymous visitors cannot execute seller onboarding'
);
select results_eq(
  $$ select has_function_privilege('authenticated', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_seller_shop' $$,
  $$ values (true) $$,
  'authenticated users can execute seller onboarding'
);

insert into auth.users (id, email, raw_user_meta_data)
values ('10000000-0000-0000-0000-000000000001', 'seller-test@yaqeen.local', '{"display_name":"Seller Test"}');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.create_seller_shop('Atelier Test', 'atelier-test', 'Boutique de validation', 'FR') $$,
  'an authenticated customer can create a seller shop atomically'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from public.shops where owner_id = '10000000-0000-0000-0000-000000000001' $$,
  $$ values (1::bigint) $$,
  'onboarding creates exactly one owned shop'
);
select results_eq(
  $$ select role::text from public.profiles where id = '10000000-0000-0000-0000-000000000001' $$,
  $$ values ('seller'::text) $$,
  'onboarding promotes the customer profile to seller'
);
select results_eq(
  $$ select member_role from public.shop_members where user_id = '10000000-0000-0000-0000-000000000001' $$,
  $$ values ('owner'::text) $$,
  'onboarding creates the owner membership'
);

select * from finish();
rollback;
