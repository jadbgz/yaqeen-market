begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(52);

-- Schema and privilege boundary ---------------------------------------------

select has_type('public', 'product_revision_status', 'product revision status enum exists');
select has_table('public', 'product_revisions', 'product revisions table exists');
select has_table('public', 'product_revision_variants', 'revision variants table exists');
select has_index('public', 'product_revisions', 'product_revisions_one_active_idx', 'only one active revision is allowed per product');
select has_index('public', 'product_revisions', 'product_revisions_review_queue_idx', 'operator queue is indexed');
select results_eq($$ select relrowsecurity from pg_class where oid = 'public.product_revisions'::regclass $$, $$ values (true) $$, 'revision RLS is enabled');
select results_eq($$ select relrowsecurity from pg_class where oid = 'public.product_revision_variants'::regclass $$, $$ values (true) $$, 'revision variant RLS is enabled');
select results_eq($$ select has_table_privilege('authenticated', 'public.product_revisions', 'INSERT') $$, $$ values (false) $$, 'direct revision inserts are revoked');
select results_eq($$ select has_table_privilege('authenticated', 'public.product_revisions', 'UPDATE') $$, $$ values (false) $$, 'direct revision updates are revoked');
select results_eq($$ select has_table_privilege('authenticated', 'public.product_revision_variants', 'INSERT') $$, $$ values (false) $$, 'direct revision variant inserts are revoked');
select results_eq(
  $$ select count(*)::bigint from pg_proc proc join pg_namespace namespace on namespace.oid = proc.pronamespace where namespace.nspname = 'public' and proc.proname in ('start_product_revision', 'update_product_revision', 'save_product_revision_variant', 'set_published_variant_inventory', 'submit_product_revision', 'withdraw_product_revision', 'review_product_revision') and proc.prosecdef $$,
  $$ values (7::bigint) $$,
  'every revision mutation is a security-definer boundary'
);
select results_eq(
  $$ select bool_and(has_function_privilege('authenticated', proc.oid, 'EXECUTE')) from pg_proc proc join pg_namespace namespace on namespace.oid = proc.pronamespace where namespace.nspname = 'public' and proc.proname in ('start_product_revision', 'update_product_revision', 'save_product_revision_variant', 'set_published_variant_inventory', 'submit_product_revision', 'withdraw_product_revision', 'review_product_revision') $$,
  $$ values (true) $$,
  'authenticated actors can reach guarded revision RPCs'
);
select results_eq(
  $$ select bool_or(has_function_privilege('anon', proc.oid, 'EXECUTE')) from pg_proc proc join pg_namespace namespace on namespace.oid = proc.pronamespace where namespace.nspname = 'public' and proc.proname in ('start_product_revision', 'update_product_revision', 'save_product_revision_variant', 'set_published_variant_inventory', 'submit_product_revision', 'withdraw_product_revision', 'review_product_revision') $$,
  $$ values (false) $$,
  'anonymous actors cannot reach revision mutations'
);

-- Actors and a fully public product -----------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('80000000-0000-0000-0000-000000000001', 'revision-seller@yaqeen.local', '{"display_name":"Revision Seller"}'),
  ('80000000-0000-0000-0000-000000000002', 'revision-outsider@yaqeen.local', '{"display_name":"Revision Outsider"}'),
  ('80000000-0000-0000-0000-000000000003', 'revision-operator@yaqeen.local', '{"display_name":"Revision Operator"}');
update public.profiles set role = 'seller' where id = '80000000-0000-0000-0000-000000000001';
update public.profiles set role = 'operator' where id = '80000000-0000-0000-0000-000000000003';

insert into public.shops (id, owner_id, slug, name, description, status, ships_from_country) values
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'atelier-revision', 'Atelier Révision', 'Boutique approuvée pour tester les révisions.', 'approved', 'FR');
insert into public.shop_members (shop_id, user_id, member_role) values
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'owner');

insert into public.products (id, shop_id, slug, title, description, category, status, published_at) values
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'cape-originale', 'Cape originale', 'Description publique originale suffisamment complète pour la marketplace.', 'mode', 'published', now()),
  ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001', 'preuve-expiree-revision', 'Preuve expirée révision', 'Produit publié artificiellement avec une preuve expirée pour tester le blocage.', 'mode', 'published', now());
insert into public.product_variants (id, product_id, sku, title, price_cents, stock_on_hand, stock_reserved, active) values
  ('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'REV-CAPE-S', 'Taille S', 4900, 10, 2, true),
  ('83000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', 'REV-CAPE-M', 'Taille M', 5200, 8, 0, true),
  ('83000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000002', 'REV-EXPIRED', 'Format expiré', 3900, 4, 0, true);
insert into public.product_evidence (id, product_id, kind, status, scope, public_summary, valid_from, valid_until, submitted_by, reviewed_by, reviewed_at) values
  ('84000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'seller_declaration', 'approved', 'Matière et opacité déclarées pour le produit fini.', 'Matière et opacité examinées par la revue Yaqeen.', current_date - 1, current_date + 30, '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003', now()),
  ('84000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000002', 'seller_declaration', 'approved', 'Ancienne déclaration arrivée à expiration.', 'Ancienne déclaration désormais expirée et non recevable.', current_date - 30, current_date - 1, '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003', now());
insert into public.product_media (id, product_id, storage_path, position, alt_text, mime_type, byte_size, width, height, status, submitted_by, reviewed_by, reviewed_at) values
  ('85000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001/85000000-0000-0000-0000-000000000001.webp', 1, 'Cape originale portée de face', 'image/webp', 100000, 1000, 1200, 'approved', '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003', now()),
  ('85000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000002/85000000-0000-0000-0000-000000000002.webp', 1, 'Produit expiré vu de face', 'image/webp', 100000, 1000, 1200, 'approved', '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003', now());

-- Snapshot and seller editing -----------------------------------------------

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.start_product_revision('82000000-0000-0000-0000-000000000001') $$, 'the owner can start a revision of a published product');
select results_eq(
  $$ select public.start_product_revision('82000000-0000-0000-0000-000000000001') $$,
  $$ select id from public.product_revisions where product_id = '82000000-0000-0000-0000-000000000001' $$,
  'starting twice is idempotent while an active revision exists'
);
reset role;

select results_eq($$ select count(*)::bigint from public.product_revisions where product_id = '82000000-0000-0000-0000-000000000001' $$, $$ values (1::bigint) $$, 'exactly one revision snapshot is created');
select results_eq($$ select count(*)::bigint from public.product_revision_variants $$, $$ values (2::bigint) $$, 'every live variant is copied into the snapshot');
select results_eq(
  $$ select title, slug from public.product_revisions where product_id = '82000000-0000-0000-0000-000000000001' $$,
  $$ values ('Cape originale'::text, 'cape-originale'::text) $$,
  'the product content is snapshotted exactly'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.update_product_revision((select id from public.product_revisions limit 1), 'Intrusion', 'intrusion', 'Description extérieure suffisamment longue pour tenter une attaque IDOR.', 'mode') $$,
  '42501', 'revision_ownership_required',
  'an outsider cannot edit another shop revision'
);
select throws_ok(
  $$ select public.set_published_variant_inventory('83000000-0000-0000-0000-000000000001', 100) $$,
  '42501', 'variant_ownership_required',
  'an outsider cannot inflate another shop inventory'
);
select results_eq($$ select count(*)::bigint from public.product_revisions $$, $$ values (0::bigint) $$, 'an outsider cannot read revision metadata through RLS');
reset role;

set local role anon;
select throws_ok(
  $$ select count(*)::bigint from public.product_revisions $$,
  '42501', 'permission denied for table product_revisions',
  'anonymous users cannot read revision metadata'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.update_product_revision((select id from public.product_revisions limit 1), 'Cape nouvelle génération', 'cape-nouvelle-generation', 'Nouvelle description détaillée qui ne doit devenir publique qu’après une décision opérateur.', 'mode') $$,
  'the owner can edit the isolated content snapshot'
);
select throws_ok(
  $$ select public.save_product_revision_variant((select id from public.product_revisions limit 1), (select id from public.product_revision_variants where source_variant_id = '83000000-0000-0000-0000-000000000001'), 'Taille S améliorée', 'REV-CAPE-M', 5400, 9, true) $$,
  '55000', 'published_inventory_is_managed_live',
  'a content revision cannot capture and later overwrite live inventory'
);
select lives_ok(
  $$ select public.save_product_revision_variant((select id from public.product_revisions limit 1), (select id from public.product_revision_variants where source_variant_id = '83000000-0000-0000-0000-000000000001'), 'Taille S améliorée', 'REV-CAPE-M', 5400, 10, true) $$,
  'the first existing variant can propose the second SKU as part of a swap'
);
select lives_ok(
  $$ select public.save_product_revision_variant((select id from public.product_revisions limit 1), (select id from public.product_revision_variants where source_variant_id = '83000000-0000-0000-0000-000000000002'), 'Taille M améliorée', 'REV-CAPE-S', 5600, 8, true) $$,
  'the second existing variant completes the safe SKU swap'
);
select lives_ok(
  $$ select public.save_product_revision_variant((select id from public.product_revisions limit 1), null, 'Taille L', 'REV-CAPE-L', 5900, 6, true) $$,
  'a revision can propose a new variant without creating it live'
);
reset role;

select results_eq($$ select title from public.products where id = '82000000-0000-0000-0000-000000000001' $$, $$ values ('Cape originale'::text) $$, 'editing a revision never mutates the live product');
select results_eq($$ select count(*)::bigint from public.product_variants where product_id = '82000000-0000-0000-0000-000000000001' $$, $$ values (2::bigint) $$, 'a proposed variant is not live before approval');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.submit_product_revision((select id from public.product_revisions limit 1)) $$, 'the complete revision can enter review');
select throws_ok(
  $$ select public.update_product_revision((select id from public.product_revisions limit 1), 'Modification tardive', 'modification-tardive', 'Une modification sous revue doit être strictement interdite par la base.', 'mode') $$,
  '55000', 'revision_content_locked',
  'revision content is locked while under review'
);
select throws_ok(
  $$ select public.review_product_revision((select id from public.product_revisions limit 1), 'approved', 'Auto-approbation vendeur strictement interdite.') $$,
  '42501', 'operator_role_required',
  'the seller cannot approve their own revision'
);
select throws_ok(
  $$ select public.set_published_variant_inventory('83000000-0000-0000-0000-000000000001', 1) $$,
  '22023', 'stock_below_reserved',
  'live inventory cannot be set below existing reservations'
);
select lives_ok(
  $$ select public.set_published_variant_inventory('83000000-0000-0000-0000-000000000001', 7) $$,
  'the seller can update live inventory while the content revision is under review'
);
reset role;

select results_eq($$ select status::text from public.product_revisions limit 1 $$, $$ values ('under_review'::text) $$, 'submission persists the locked review state');
select results_eq($$ select title from public.products where id = '82000000-0000-0000-0000-000000000001' $$, $$ values ('Cape originale'::text) $$, 'the old public version remains live throughout review');

-- Operator promotion ---------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"80000000-0000-0000-0000-000000000003","role":"authenticated"}';
select lives_ok(
  $$ select public.review_product_revision((select id from public.product_revisions limit 1), 'approved', 'Contenu et variantes comparés à la version publique puis validés.') $$,
  'an operator can atomically promote the revision'
);
reset role;

select results_eq(
  $$ select title, slug, status::text from public.products where id = '82000000-0000-0000-0000-000000000001' $$,
  $$ values ('Cape nouvelle génération'::text, 'cape-nouvelle-generation'::text, 'published'::text) $$,
  'approved content replaces the live version without unpublishing it'
);
select results_eq(
  $$ select id, sku, price_cents, stock_on_hand from public.product_variants where id = '83000000-0000-0000-0000-000000000001' $$,
  $$ values ('83000000-0000-0000-0000-000000000001'::uuid, 'REV-CAPE-M'::text, 5400, 7) $$,
  'the first live variant keeps its identifier and the newest operational stock'
);
select results_eq(
  $$ select id, sku from public.product_variants where id = '83000000-0000-0000-0000-000000000002' $$,
  $$ values ('83000000-0000-0000-0000-000000000002'::uuid, 'REV-CAPE-S'::text) $$,
  'SKU swaps are applied without breaking stable variant identifiers'
);
select results_eq($$ select count(*)::bigint from public.product_variants where product_id = '82000000-0000-0000-0000-000000000001' $$, $$ values (3::bigint) $$, 'the proposed new variant is created exactly once');
select results_eq($$ select status::text from public.product_revisions limit 1 $$, $$ values ('approved'::text) $$, 'the revision becomes immutable approved history');
select results_eq($$ select count(*)::bigint from public.moderation_decisions where entity_type = 'product_revision' $$, $$ values (1::bigint) $$, 'promotion leaves an immutable moderation decision');

-- Concurrency, rejection and withdrawal ------------------------------------

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.start_product_revision('82000000-0000-0000-0000-000000000001') $$, 'a new revision can start after the approved history closes');
select lives_ok($$ select public.submit_product_revision((select id from public.product_revisions where status = 'draft')) $$, 'the unchanged second snapshot can enter review');
reset role;

update public.products set updated_at = now() + interval '1 second' where id = '82000000-0000-0000-0000-000000000001';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"80000000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ select public.review_product_revision((select id from public.product_revisions where status = 'under_review'), 'approved', 'Cette révision est devenue obsolète avant approbation.') $$,
  '40001', 'revision_base_changed',
  'optimistic concurrency rejects a stale approval'
);
select lives_ok(
  $$ select public.review_product_revision((select id from public.product_revisions where status = 'under_review'), 'rejected', 'La version de base a changé ; le vendeur doit repartir de l’état courant.') $$,
  'an operator can reject the stale proposal without mutating the live product'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.update_product_revision((select id from public.product_revisions where status = 'rejected'), 'Cape synchronisée', 'cape-synchronisee', 'Description resynchronisée avec la version publique courante après le refus opérateur.', 'mode') $$,
  'editing a rejected revision reopens it against the current base'
);
select lives_ok(
  $$ select public.withdraw_product_revision((select id from public.product_revisions where status = 'draft')) $$,
  'the seller can withdraw a reopened draft revision'
);
reset role;
select results_eq($$ select count(*)::bigint from public.product_revisions where status in ('draft', 'under_review', 'rejected') $$, $$ values (0::bigint) $$, 'withdrawal releases the active revision slot');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.start_product_revision('82000000-0000-0000-0000-000000000002') $$, 'the seller can snapshot a product before its stale proof is noticed');
select throws_ok(
  $$ select public.submit_product_revision((select id from public.product_revisions where product_id = '82000000-0000-0000-0000-000000000002')) $$,
  '55000', 'current_evidence_required',
  'a product without current evidence cannot submit a revision'
);
reset role;

select * from finish();
rollback;
