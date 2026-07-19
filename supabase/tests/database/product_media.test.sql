begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(48);

select has_type('public', 'product_media_status', 'product media status enum exists');
select has_table('public', 'product_media', 'product media table exists');
select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'public.product_media'::regclass $$,
  $$ values (true) $$,
  'RLS is enabled on product media'
);
select policies_are('public', 'product_media', array['product_media_operator_read', 'product_media_public_or_member_read']);
select has_index('public', 'product_media', 'product_media_active_position_idx', 'active media positions are unique per product');
select has_index('public', 'product_media', 'product_media_product_status_idx', 'product media review queries are indexed');
select results_eq(
  $$ select count(*)::bigint, bool_and(not public) from storage.buckets where id = 'product-media' $$,
  $$ values (1::bigint, true) $$,
  'the product media bucket exists and is private'
);
select results_eq(
  $$ select file_size_limit from storage.buckets where id = 'product-media' $$,
  $$ values (4194304::bigint) $$,
  'the bucket rejects objects larger than four MiB'
);
select results_eq(
  $$ select allowed_mime_types from storage.buckets where id = 'product-media' $$,
  $$ values (array['image/webp']::text[]) $$,
  'only normalized WebP objects are accepted'
);
select results_eq($$ select has_table_privilege('authenticated', 'public.product_media', 'INSERT') $$, $$ values (false) $$, 'clients cannot insert media metadata directly');
select results_eq($$ select has_table_privilege('authenticated', 'public.product_media', 'UPDATE') $$, $$ values (false) $$, 'clients cannot approve media directly');
select results_eq($$ select has_table_privilege('authenticated', 'public.product_media', 'DELETE') $$, $$ values (false) $$, 'clients cannot delete media metadata directly');
select results_eq($$ select has_table_privilege('anon', 'public.product_media', 'SELECT') $$, $$ values (true) $$, 'anonymous storefronts can reach the guarded media read model');
select results_eq($$ select has_table_privilege('authenticated', 'public.product_media', 'SELECT') $$, $$ values (true) $$, 'authenticated actors can reach guarded media reads');
select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_product_media_draft' and p.prosecdef $$,
  $$ values (1::bigint) $$,
  'media registration is a security-definer boundary'
);
select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'discard_product_media' and p.prosecdef $$,
  $$ values (1::bigint) $$,
  'media discard is a security-definer boundary'
);
select results_eq(
  $$ select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_product_media_draft' $$,
  $$ values (false) $$,
  'anonymous visitors cannot register product media'
);
select results_eq(
  $$ select has_function_privilege('authenticated', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_product_media_draft' $$,
  $$ values (true) $$,
  'authenticated sellers can reach guarded media registration'
);
select results_eq(
  $$ select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'discard_product_media' $$,
  $$ values (false) $$,
  'anonymous visitors cannot discard product media'
);
select results_eq(
  $$ select has_function_privilege('authenticated', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'discard_product_media' $$,
  $$ values (true) $$,
  'authenticated sellers can reach guarded media discard'
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('30000000-0000-0000-0000-000000000001', 'media-seller@yaqeen.local', '{"display_name":"Media Seller"}'),
  ('30000000-0000-0000-0000-000000000002', 'media-outsider@yaqeen.local', '{"display_name":"Media Outsider"}'),
  ('30000000-0000-0000-0000-000000000003', 'media-operator@yaqeen.local', '{"display_name":"Media Operator"}');
update public.profiles set role = 'seller' where id = '30000000-0000-0000-0000-000000000001';
update public.profiles set role = 'operator' where id = '30000000-0000-0000-0000-000000000003';

insert into public.shops (id, owner_id, slug, name, description, status, ships_from_country)
values ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'media-shop', 'Media Shop', 'Boutique approuvée pour les tests de médias produit.', 'approved', 'FR');
insert into public.shop_members (shop_id, user_id, member_role)
values ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'owner');
insert into public.products (id, shop_id, slug, title, description, category, status)
values ('32000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'media-product', 'Produit avec médias', 'Description suffisamment complète pour tester la soumission du produit et de son image.', 'cosmetiques', 'draft');
insert into public.product_variants (id, product_id, sku, title, price_cents, stock_on_hand)
values ('33000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 'MEDIA-01', 'Format standard', 2490, 8);
insert into public.product_evidence (id, product_id, kind, status, scope, public_summary, submitted_by)
values ('34000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 'seller_declaration', 'pending', 'Composition et procédé déclarés pour le produit fini.', 'Déclaration détaillée proposée à la revue de l’équipe Yaqeen.', '30000000-0000-0000-0000-000000000001');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select * from public.create_product_media_draft('32000000-0000-0000-0000-000000000001', 1, '  Pot de cosmétique vu de face sur fond clair  ', 125000, 1200, 1500) $$,
  'the owning seller can register normalized media metadata'
);
reset role;

select results_eq($$ select count(*)::bigint from public.product_media where product_id = '32000000-0000-0000-0000-000000000001' $$, $$ values (1::bigint) $$, 'registration creates exactly one media row');
select results_eq(
  $$ select status::text, mime_type, byte_size, width, height from public.product_media where product_id = '32000000-0000-0000-0000-000000000001' $$,
  $$ values ('pending'::text, 'image/webp'::text, 125000, 1200, 1500) $$,
  'registered media remains pending with server-derived technical metadata'
);
select results_eq(
  $$ select alt_text from public.product_media where product_id = '32000000-0000-0000-0000-000000000001' $$,
  $$ values ('Pot de cosmétique vu de face sur fond clair'::text) $$,
  'alternative text is normalized before persistence'
);
select results_eq(
  $$ select storage_path ~ '^32000000-0000-0000-0000-000000000001/[0-9a-f-]{36}\.webp$' from public.product_media where product_id = '32000000-0000-0000-0000-000000000001' $$,
  $$ values (true) $$,
  'the server generates an unguessable product-scoped storage path'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select * from public.create_product_media_draft('32000000-0000-0000-0000-000000000001', 2, 'Image frauduleuse suffisamment décrite', 120000, 1000, 1000) $$,
  '42501', 'product_ownership_required',
  'an outsider cannot register media for another shop'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select * from public.create_product_media_draft('32000000-0000-0000-0000-000000000001', 1, 'Deuxième image au même emplacement', 120000, 1000, 1000) $$,
  '23505', 'product_media_position_taken',
  'an active gallery position cannot be overwritten'
);
select throws_ok(
  $$ select * from public.create_product_media_draft('32000000-0000-0000-0000-000000000001', 2, 'Image beaucoup trop petite', 120000, 100, 100) $$,
  '22023', 'invalid_media_dimensions_or_size',
  'technical bounds are enforced inside the database boundary'
);
select results_eq($$ select count(*)::bigint from public.product_media where product_id = '32000000-0000-0000-0000-000000000001' $$, $$ values (1::bigint) $$, 'the seller can read their own pending media');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}';
select results_eq($$ select count(*)::bigint from public.product_media where product_id = '32000000-0000-0000-0000-000000000001' $$, $$ values (0::bigint) $$, 'an outsider cannot read pending media metadata');
reset role;

set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
select results_eq($$ select count(*)::bigint from public.product_media where product_id = '32000000-0000-0000-0000-000000000001' $$, $$ values (0::bigint) $$, 'anonymous visitors cannot read pending media metadata');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_like(
  $$ insert into storage.objects (bucket_id, name, owner_id, metadata) values ('product-media', '32000000-0000-0000-0000-000000000001/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp', '30000000-0000-0000-0000-000000000002', '{"mimetype":"image/webp","size":1000}') $$,
  '%row-level security%',
  'an outsider cannot upload an unregistered object into the media bucket'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id, metadata)
     select storage_bucket, storage_path, '30000000-0000-0000-0000-000000000001', '{"mimetype":"image/webp","size":125000}'::jsonb
     from public.product_media where product_id = '32000000-0000-0000-0000-000000000001' $$,
  'the owner can upload only the object pre-registered by the RPC'
);
reset role;

set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
select results_eq($$ select count(*)::bigint from storage.objects where bucket_id = 'product-media' $$, $$ values (0::bigint) $$, 'anonymous visitors cannot read a pending storage object');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.submit_product_for_review('32000000-0000-0000-0000-000000000001') $$, 'a product with a real stored object can enter review');
reset role;
select results_eq($$ select status::text from public.products where id = '32000000-0000-0000-0000-000000000001' $$, $$ values ('under_review'::text) $$, 'media-backed submission locks the product under review');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ update public.product_media set status = 'approved' where product_id = '32000000-0000-0000-0000-000000000001' $$, '42501', 'permission denied for table product_media', 'the seller cannot self-approve media directly');
select throws_ok(
  $$ select public.review_product_submission('32000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 'approved', 'Auto-approbation média interdite.', 'Résumé public frauduleux interdit pour ce produit.') $$,
  '42501', 'operator_role_required',
  'the seller cannot approve the product-media bundle through the review RPC'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}';
select results_eq($$ select count(*)::bigint from public.product_media where product_id = '32000000-0000-0000-0000-000000000001' $$, $$ values (1::bigint) $$, 'an operator can inspect pending media metadata');
select results_eq($$ select count(*)::bigint from storage.objects where bucket_id = 'product-media' $$, $$ values (1::bigint) $$, 'an operator can inspect the pending storage object');
select lives_ok(
  $$ select public.review_product_submission('32000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 'approved', 'Fiche, preuve et image contrôlées ensemble.', 'Déclaration vendeur et photographie produit examinées par Yaqeen.') $$,
  'an operator approves evidence, media and publication atomically'
);
reset role;

select results_eq($$ select status::text from public.products where id = '32000000-0000-0000-0000-000000000001' $$, $$ values ('published'::text) $$, 'the approved media-backed product is published');
select results_eq(
  $$ select status::text, reviewed_by from public.product_media where product_id = '32000000-0000-0000-0000-000000000001' $$,
  $$ values ('approved'::text, '30000000-0000-0000-0000-000000000003'::uuid) $$,
  'media approval is attributed to the operator'
);

set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
select results_eq($$ select count(*)::bigint from public.product_media where product_id = '32000000-0000-0000-0000-000000000001' $$, $$ values (1::bigint) $$, 'anonymous storefronts can read approved media metadata');
select results_eq($$ select count(*)::bigint from storage.objects where bucket_id = 'product-media' $$, $$ values (1::bigint) $$, 'anonymous storefronts can sign and retrieve the approved private object');
select results_eq($$ select count(*)::bigint from public.products where id = '32000000-0000-0000-0000-000000000001' $$, $$ values (1::bigint) $$, 'the media-backed published product remains in the public catalog');
reset role;

select results_eq(
  $$ select count(*)::bigint from public.moderation_decisions where entity_type = 'product_media' and reviewer_id = '30000000-0000-0000-0000-000000000003' $$,
  $$ values (1::bigint) $$,
  'media moderation leaves its own immutable audit event'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.discard_product_media((select id from public.product_media where product_id = '32000000-0000-0000-0000-000000000001')) $$,
  '55000', 'approved_media_cannot_be_discarded',
  'approved media cannot be removed by the seller'
);
reset role;

select * from finish();
rollback;
