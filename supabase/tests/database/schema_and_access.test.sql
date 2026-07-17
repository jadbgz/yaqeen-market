begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(77);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'shops', 'shops table exists');
select has_table('public', 'shop_members', 'shop_members table exists');
select has_table('public', 'products', 'products table exists');
select has_table('public', 'product_variants', 'product_variants table exists');
select has_table('public', 'product_evidence', 'product_evidence table exists');
select has_table('public', 'moderation_decisions', 'moderation decisions table exists');

select results_eq(
  $$
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('profiles', 'shops', 'shop_members', 'products', 'product_variants', 'product_evidence', 'moderation_decisions')
      and c.relrowsecurity
  $$,
  $$ values (7::bigint) $$,
  'RLS is enabled on every exposed domain table'
);

select policies_are('public', 'profiles', array[
  'profiles_self_select', 'profiles_self_update'
]);
select policies_are('public', 'shops', array[
  'shops_public_read', 'shops_operator_read'
]);
select policies_are('public', 'shop_members', array[
  'shop_members_member_read', 'shop_members_owner_insert'
]);
select policies_are('public', 'products', array[
  'products_public_read', 'products_operator_read'
]);
select policies_are('public', 'product_variants', array[
  'variants_public_read', 'variants_operator_read'
]);
select policies_are('public', 'product_evidence', array[
  'evidence_public_read', 'evidence_operator_read'
]);
select policies_are('public', 'moderation_decisions', array[
  'moderation_decisions_operator_read'
]);

select has_index('public', 'products', 'products_shop_status_idx', 'product review queries have a shop/status index');
select has_index('public', 'product_variants', 'variants_product_active_idx', 'active variant queries have a product index');
select has_index('public', 'product_evidence', 'evidence_product_status_idx', 'evidence review queries have a product/status index');
select has_index('public', 'shops', 'shops_owner_unique_idx', 'an account can own only one shop during the initial release');
select has_index('public', 'moderation_decisions', 'moderation_decisions_entity_idx', 'moderation history has an entity timeline index');

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
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.products', 'INSERT') $$,
  $$ values (false) $$,
  'authenticated clients cannot bypass the product RPC with a direct insert'
);
select results_eq(
  $$ select has_column_privilege('authenticated', 'public.products', 'title', 'UPDATE') $$,
  $$ values (false) $$,
  'authenticated clients cannot alter a reviewed product directly'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.product_variants', 'INSERT') $$,
  $$ values (false) $$,
  'authenticated clients cannot attach an unreviewed variant directly'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.product_variants', 'UPDATE') $$,
  $$ values (false) $$,
  'authenticated clients cannot change reviewed price or stock directly'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.product_evidence', 'INSERT') $$,
  $$ values (false) $$,
  'authenticated clients cannot approve evidence through a direct insert'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.shops', 'INSERT') $$,
  $$ values (false) $$,
  'authenticated clients cannot bypass shop onboarding with a direct insert'
);
select results_eq(
  $$ select has_column_privilege('authenticated', 'public.shops', 'description', 'UPDATE') $$,
  $$ values (false) $$,
  'authenticated clients cannot change a submitted or approved shop directly'
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

select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_product_draft' $$,
  $$ values (1::bigint) $$,
  'atomic product draft function exists'
);
select results_eq(
  $$ select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_product_draft' $$,
  $$ values (true) $$,
  'product draft creation is a security-definer boundary'
);
select results_eq(
  $$ select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_product_draft' $$,
  $$ values (false) $$,
  'anonymous visitors cannot create product drafts'
);
select results_eq(
  $$ select has_function_privilege('authenticated', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_product_draft' $$,
  $$ values (true) $$,
  'authenticated sellers can execute product draft creation'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.create_product_draft(
    (select id from public.shops where slug = 'atelier-test'),
    'Musc de validation', 'musc-validation', 'Description produit complète et vérifiée par le test automatisé.', 'parfums',
    'Flacon 50 ml', 'TEST-MUSC-50', 3490, 12, 'seller_declaration',
    'Déclaration portant sur la composition et le procédé de fabrication.', null, null,
    'Déclaration vendeur soumise à la revue Yaqeen.'
  ) $$,
  'a shop member creates product, variant, stock and evidence atomically'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from public.products where slug = 'musc-validation' $$,
  $$ values (1::bigint) $$,
  'the transaction creates exactly one product'
);
select results_eq(
  $$ select status::text from public.products where slug = 'musc-validation' $$,
  $$ values ('draft'::text) $$,
  'seller-created products are always drafts'
);
select results_eq(
  $$ select v.price_cents, v.stock_on_hand, v.stock_reserved, v.currency::text from public.product_variants v join public.products p on p.id = v.product_id where p.slug = 'musc-validation' $$,
  $$ values (3490, 12, 0, 'EUR'::text) $$,
  'price and physical stock are persisted without a reserved quantity'
);
select results_eq(
  $$ select e.status::text, e.kind::text, e.submitted_by from public.product_evidence e join public.products p on p.id = e.product_id where p.slug = 'musc-validation' $$,
  $$ values ('pending'::text, 'seller_declaration'::text, '10000000-0000-0000-0000-000000000001'::uuid) $$,
  'first evidence remains pending and is attributed to its submitter'
);

insert into public.product_media (
  id, product_id, storage_path, position, alt_text, mime_type, byte_size, width, height, submitted_by
)
select
  '15000000-0000-0000-0000-000000000001', p.id,
  p.id::text || '/15000000-0000-0000-0000-000000000001.webp', 1,
  'Flacon de musc vu de face sur un fond clair', 'image/webp', 120000, 1200, 1500,
  '10000000-0000-0000-0000-000000000001'
from public.products p where p.slug = 'musc-validation';

insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'product-media', pm.storage_path, '10000000-0000-0000-0000-000000000001',
  '{"mimetype":"image/webp","size":120000}'::jsonb
from public.product_media pm where pm.id = '15000000-0000-0000-0000-000000000001';

insert into auth.users (id, email, raw_user_meta_data)
values ('10000000-0000-0000-0000-000000000002', 'outsider-test@yaqeen.local', '{"display_name":"Outsider Test"}');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.create_product_draft(
    (select id from public.shops where slug = 'atelier-test'),
    'Produit interdit', 'produit-interdit', null, 'parfums', 'Standard', 'OUTSIDER-01',
    1000, 1, 'seller_declaration', 'Déclaration suffisamment détaillée pour le test.', null, null, null
  ) $$,
  '42501', 'shop_membership_required',
  'an authenticated outsider cannot write into another shop'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from public.products where slug = 'produit-interdit' $$,
  $$ values (0::bigint) $$,
  'a refused transaction leaves no partial product behind'
);

select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('submit_shop_for_review', 'submit_product_for_review', 'review_shop_submission', 'review_product_submission') $$,
  $$ values (4::bigint) $$,
  'the four moderation transition functions exist'
);
select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('submit_shop_for_review', 'submit_product_for_review', 'review_shop_submission', 'review_product_submission') and p.prosecdef $$,
  $$ values (4::bigint) $$,
  'all moderation transitions are security-definer boundaries'
);
select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('submit_shop_for_review', 'submit_product_for_review', 'review_shop_submission', 'review_product_submission') and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  $$ values (0::bigint) $$,
  'anonymous visitors cannot execute moderation transitions'
);
select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('submit_shop_for_review', 'submit_product_for_review', 'review_shop_submission', 'review_product_submission') and has_function_privilege('authenticated', p.oid, 'EXECUTE') $$,
  $$ values (4::bigint) $$,
  'authenticated sessions can reach transitions that enforce their role internally'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ insert into public.products (shop_id, slug, title, category, status)
     values ((select id from public.shops where slug = 'atelier-test'), 'auto-publie', 'Produit auto-publié', 'parfums', 'published') $$,
  '42501', 'permission denied for table products',
  'a seller cannot self-publish with a direct PostgREST-equivalent insert'
);
select throws_ok(
  $$ insert into public.product_evidence (product_id, kind, status, scope, submitted_by, reviewed_by, reviewed_at)
     values ((select id from public.products where slug = 'musc-validation'), 'seller_declaration', 'approved',
       'Tentative de validation directe par le vendeur.',
       '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', now()) $$,
  '42501', 'permission denied for table product_evidence',
  'a seller cannot self-approve evidence with a direct PostgREST-equivalent insert'
);
select throws_ok(
  $$ insert into public.product_variants (product_id, sku, title, price_cents, stock_on_hand)
     values ((select id from public.products where slug = 'musc-validation'), 'BYPASS-PRICE', 'Prix non revu', 1, 999999) $$,
  '42501', 'permission denied for table product_variants',
  'a seller cannot attach an unreviewed price or stock directly'
);
select throws_ok(
  $$ insert into public.shops (owner_id, slug, name, status)
     values ('10000000-0000-0000-0000-000000000001', 'boutique-auto-approuvee', 'Boutique auto-approuvée', 'approved') $$,
  '42501', 'permission denied for table shops',
  'a seller cannot self-approve a shop with a direct PostgREST-equivalent insert'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.submit_product_for_review((select id from public.products where slug = 'musc-validation')) $$,
  '42501', 'product_ownership_required',
  'an outsider cannot submit another shop product for review'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.submit_shop_for_review((select id from public.shops where slug = 'atelier-test')) $$,
  'a shop owner can submit a complete shop for review'
);
reset role;
select results_eq(
  $$ select status::text from public.shops where slug = 'atelier-test' $$,
  $$ values ('under_review'::text) $$,
  'shop submission enters the under-review state'
);
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ update public.shops set description = 'Description changée après soumission.' where slug = 'atelier-test' $$,
  '42501', 'permission denied for table shops',
  'a seller cannot alter shop content while it is under review'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.submit_product_for_review((select id from public.products where slug = 'musc-validation')) $$,
  'a shop member can submit a complete product for review'
);
reset role;
select results_eq(
  $$ select status::text from public.products where slug = 'musc-validation' $$,
  $$ values ('under_review'::text) $$,
  'product submission enters the under-review state'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.review_shop_submission((select id from public.shops where slug = 'atelier-test'), 'approved', 'Auto-approbation vendeur interdite.') $$,
  '42501', 'operator_role_required',
  'a seller cannot review their own shop'
);
select throws_ok(
  $$ select public.review_product_submission(
       (select id from public.products where slug = 'musc-validation'),
       (select e.id from public.product_evidence e join public.products p on p.id = e.product_id where p.slug = 'musc-validation'),
       'approved', 'Auto-approbation produit interdite.', 'Résumé public frauduleux interdit.'
     ) $$,
  '42501', 'operator_role_required',
  'a seller cannot review their own product or evidence'
);
reset role;

insert into auth.users (id, email, raw_user_meta_data)
values ('10000000-0000-0000-0000-000000000003', 'operator-test@yaqeen.local', '{"display_name":"Operator Test"}');
update public.profiles set role = 'operator' where id = '10000000-0000-0000-0000-000000000003';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
select lives_ok(
  $$ select public.review_shop_submission((select id from public.shops where slug = 'atelier-test'), 'approved', 'Identité et informations de la boutique contrôlées.') $$,
  'an operator can approve a submitted shop'
);
reset role;
select results_eq(
  $$ select status::text from public.shops where slug = 'atelier-test' $$,
  $$ values ('approved'::text) $$,
  'operator decision activates the shop'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
select lives_ok(
  $$ select public.review_product_submission(
       (select id from public.products where slug = 'musc-validation'),
       (select e.id from public.product_evidence e join public.products p on p.id = e.product_id where p.slug = 'musc-validation'),
       'approved', 'Contenu, variante et preuve documentaire contrôlés.',
       'Déclaration vendeur examinée par Yaqeen ; périmètre limité à la composition déclarée.'
     ) $$,
  'an operator can approve evidence and publish its product atomically'
);
reset role;
select results_eq(
  $$ select status::text, (published_at is not null) from public.products where slug = 'musc-validation' $$,
  $$ values ('published'::text, true) $$,
  'product publication records its state and publication time'
);
select results_eq(
  $$ select e.status::text, e.reviewed_by from public.product_evidence e join public.products p on p.id = e.product_id where p.slug = 'musc-validation' $$,
  $$ values ('approved'::text, '10000000-0000-0000-0000-000000000003'::uuid) $$,
  'evidence approval is attributed to the operator'
);
select results_eq(
  $$ select count(*)::bigint from public.moderation_decisions where reviewer_id = '10000000-0000-0000-0000-000000000003' $$,
  $$ values (3::bigint) $$,
  'shop, product and product-media decisions leave an immutable audit trail'
);

set local role anon;
select results_eq(
  $$ select count(*)::bigint from public.products where slug = 'musc-validation' $$,
  $$ values (1::bigint) $$,
  'anonymous storefront readers can see the legitimately published product'
);
select results_eq(
  $$ select count(*)::bigint from public.product_evidence e join public.products p on p.id = e.product_id
     where p.slug = 'musc-validation' and e.status = 'approved' and e.public_summary is not null $$,
  $$ values (1::bigint) $$,
  'anonymous storefront readers can see only the approved public evidence summary'
);
reset role;

select * from finish();
rollback;
