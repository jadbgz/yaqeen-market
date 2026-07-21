begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(45);

-- Contract and privilege boundary -------------------------------------------

select has_function('public', 'is_evidence_current', array['date', 'date'], 'current evidence helper exists');
select has_function('public', 'has_current_approved_evidence', array['uuid'], 'approved evidence helper exists');
select has_function('public', 'is_product_publicly_listed', array['uuid'], 'public listing helper exists');
select has_function('public', 'update_product_draft', array['uuid', 'text', 'text', 'text', 'text'], 'draft content editor exists');
select has_function('public', 'save_product_variant', array['uuid', 'uuid', 'text', 'text', 'integer', 'integer', 'boolean'], 'variant save boundary exists');
select has_function('public', 'deactivate_product_variant', array['uuid'], 'variant retirement boundary exists');
select has_function('public', 'add_product_evidence', array['uuid', 'text', 'text', 'text', 'text', 'text', 'date', 'date'], 'evidence submission boundary exists');
select has_function('public', 'discard_pending_product_evidence', array['uuid'], 'pending evidence discard boundary exists');
select has_function('public', 'expire_due_product_evidence', array[]::text[], 'evidence expiry worker exists');
select results_eq(
  $$ select count(*)::bigint from pg_proc proc join pg_namespace namespace on namespace.oid = proc.pronamespace where namespace.nspname = 'public' and proc.proname in ('update_product_draft', 'save_product_variant', 'deactivate_product_variant', 'add_product_evidence', 'discard_pending_product_evidence') and proc.prosecdef $$,
  $$ values (5::bigint) $$,
  'all seller mutations are reviewed security-definer boundaries'
);
select results_eq(
  $$ select bool_or(has_function_privilege('anon', proc.oid, 'EXECUTE')) from pg_proc proc join pg_namespace namespace on namespace.oid = proc.pronamespace where namespace.nspname = 'public' and proc.proname in ('update_product_draft', 'save_product_variant', 'deactivate_product_variant', 'add_product_evidence', 'discard_pending_product_evidence') $$,
  $$ values (false) $$,
  'anonymous actors cannot reach seller mutations'
);
select results_eq(
  $$ select bool_and(has_function_privilege('authenticated', proc.oid, 'EXECUTE')) from pg_proc proc join pg_namespace namespace on namespace.oid = proc.pronamespace where namespace.nspname = 'public' and proc.proname in ('update_product_draft', 'save_product_variant', 'deactivate_product_variant', 'add_product_evidence', 'discard_pending_product_evidence') $$,
  $$ values (true) $$,
  'authenticated sellers can reach the guarded RPCs'
);
select results_eq($$ select has_table_privilege('authenticated', 'public.products', 'UPDATE') $$, $$ values (false) $$, 'direct product updates remain revoked');
select results_eq($$ select has_table_privilege('authenticated', 'public.product_variants', 'INSERT') $$, $$ values (false) $$, 'direct variant inserts remain revoked');
select results_eq($$ select has_table_privilege('authenticated', 'public.product_evidence', 'INSERT') $$, $$ values (false) $$, 'direct evidence inserts remain revoked');

-- Actors and catalog ---------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('70000000-0000-0000-0000-000000000001', 'lifecycle-seller@yaqeen.local', '{"display_name":"Lifecycle Seller"}'),
  ('70000000-0000-0000-0000-000000000002', 'lifecycle-outsider@yaqeen.local', '{"display_name":"Lifecycle Outsider"}'),
  ('70000000-0000-0000-0000-000000000003', 'lifecycle-operator@yaqeen.local', '{"display_name":"Lifecycle Operator"}'),
  ('70000000-0000-0000-0000-000000000004', 'lifecycle-customer@yaqeen.local', '{"display_name":"Lifecycle Customer"}');
update public.profiles set role = 'seller' where id = '70000000-0000-0000-0000-000000000001';
update public.profiles set role = 'operator' where id = '70000000-0000-0000-0000-000000000003';

insert into public.shops (id, owner_id, slug, name, description, status, ships_from_country)
values ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'atelier-cycle', 'Atelier Cycle', 'Boutique approuvée pour le cycle catalogue complet.', 'approved', 'FR');
insert into public.shop_members (shop_id, user_id, member_role)
values ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'owner');

insert into public.products (id, shop_id, slug, title, description, category, status) values
  ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'brouillon-cycle', 'Brouillon cycle', 'Description complète destinée à vérifier les corrections précises du vendeur.', 'mode', 'draft'),
  ('72000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000001', 'produit-courant', 'Produit courant', 'Produit public couvert par une preuve actuellement valide.', 'cosmetiques', 'published'),
  ('72000000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-000000000001', 'produit-expire', 'Produit expiré', 'Produit publié dont la seule preuve est arrivée à expiration.', 'cosmetiques', 'published'),
  ('72000000-0000-0000-0000-000000000004', '71000000-0000-0000-0000-000000000001', 'produit-futur', 'Produit futur', 'Produit dont la preuve ne devient valide que demain.', 'cosmetiques', 'published');

insert into public.product_variants (id, product_id, sku, title, price_cents, stock_on_hand, stock_reserved, active) values
  ('73000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'CYCLE-DRAFT-01', 'Taille S', 2900, 5, 2, true),
  ('73000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002', 'CYCLE-CURRENT-01', 'Format courant', 1900, 8, 0, true),
  ('73000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000003', 'CYCLE-EXPIRED-01', 'Format expiré', 2100, 8, 0, true),
  ('73000000-0000-0000-0000-000000000004', '72000000-0000-0000-0000-000000000004', 'CYCLE-FUTURE-01', 'Format futur', 2300, 8, 0, true);

insert into public.product_evidence (id, product_id, kind, status, scope, public_summary, valid_from, valid_until, submitted_by, reviewed_by, reviewed_at) values
  ('74000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'seller_declaration', 'pending', 'Périmètre initial de la preuve à corriger.', 'Résumé initial proposé à la revue Yaqeen.', null, null, '70000000-0000-0000-0000-000000000001', null, null),
  ('74000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002', 'third_party_certificate', 'approved', 'Composition du produit fini certifiée.', 'Composition du produit fini certifiée et revue.', current_date - 10, current_date + 10, '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', now()),
  ('74000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000003', 'third_party_certificate', 'approved', 'Ancienne certification du produit fini.', 'Ancienne certification arrivée à expiration.', current_date - 20, current_date - 1, '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', now()),
  ('74000000-0000-0000-0000-000000000004', '72000000-0000-0000-0000-000000000004', 'third_party_certificate', 'approved', 'Certification future du produit fini.', 'Certification qui ne doit pas encore rendre le produit public.', current_date + 1, current_date + 30, '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', now());

insert into public.product_media (id, product_id, storage_path, position, alt_text, mime_type, byte_size, width, height, status, submitted_by, reviewed_by, reviewed_at) values
  ('75000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002/75000000-0000-0000-0000-000000000002.webp', 1, 'Produit courant vu de face', 'image/webp', 100000, 1000, 1000, 'approved', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', now()),
  ('75000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000003/75000000-0000-0000-0000-000000000003.webp', 1, 'Produit expiré vu de face', 'image/webp', 100000, 1000, 1000, 'approved', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', now()),
  ('75000000-0000-0000-0000-000000000004', '72000000-0000-0000-0000-000000000004', '72000000-0000-0000-0000-000000000004/75000000-0000-0000-0000-000000000004.webp', 1, 'Produit futur vu de face', 'image/webp', 100000, 1000, 1000, 'approved', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', now());

-- Seller lifecycle -----------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.update_product_draft('72000000-0000-0000-0000-000000000001', '  Cape structurée  ', 'cape-structuree', 'Description corrigée avec matière, coupe, origine et conseils d’entretien.', 'mode') $$,
  'the owner can correct draft content'
);
reset role;
select results_eq(
  $$ select title, slug from public.products where id = '72000000-0000-0000-0000-000000000001' $$,
  $$ values ('Cape structurée'::text, 'cape-structuree'::text) $$,
  'draft content is normalized before persistence'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.save_product_variant('72000000-0000-0000-0000-000000000001', null, 'Taille M', 'cycle-draft-02', 3100, 7, true) $$,
  'the owner can add a second variant'
);
reset role;
select results_eq($$ select count(*)::bigint from public.product_variants where product_id = '72000000-0000-0000-0000-000000000001' and active $$, $$ values (2::bigint) $$, 'both active variants are retained');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.add_product_evidence('72000000-0000-0000-0000-000000000001', 'third_party_certificate', 'Composition et chaîne de fabrication du produit fini.', 'Organisme Test', 'CERT-NEW', 'Certificat tiers proposé pour la revue du produit fini.', current_date, current_date + 365) $$,
  'the owner can submit an additional dated proof'
);
reset role;
select results_eq(
  $$ select status::text, reviewed_by is null from public.product_evidence where reference_number = 'CERT-NEW' $$,
  $$ values ('pending'::text, true) $$,
  'seller-submitted evidence is forced to pending without reviewer attribution'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.add_product_evidence('72000000-0000-0000-0000-000000000001', 'third_party_certificate', 'Preuve sans détails obligatoires.', null, null, 'Résumé public suffisamment long pour être examiné.', null, null) $$,
  '22023', 'certificate_details_required',
  'a third-party certificate requires issuer and reference inside the database'
);
select throws_ok(
  $$ select public.save_product_variant('72000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', 'Taille S', 'CYCLE-DRAFT-01', 2900, 1, true) $$,
  '22023', 'stock_below_reserved',
  'physical stock cannot move below already reserved stock'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"70000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.update_product_draft('72000000-0000-0000-0000-000000000001', 'Intrusion', 'intrusion', 'Description suffisamment longue mais appartenant à un acteur non autorisé.', 'mode') $$,
  '42501', 'product_ownership_required',
  'an outsider cannot edit another shop catalog'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.update_product_draft('72000000-0000-0000-0000-000000000002', 'Publication modifiée', 'publication-modifiee', 'Description suffisamment longue pour tenter une modification interdite.', 'cosmetiques') $$,
  '55000', 'product_content_locked',
  'published content cannot be silently changed by its seller'
);
select lives_ok(
  $$ select public.discard_pending_product_evidence((select id from public.product_evidence where reference_number = 'CERT-NEW')) $$,
  'the owner can discard an unreviewed proof'
);
reset role;
select results_eq($$ select count(*)::bigint from public.product_evidence where reference_number = 'CERT-NEW' $$, $$ values (0::bigint) $$, 'discard removes only the pending submission');

-- Unified public trust gate --------------------------------------------------

select results_eq($$ select public.is_evidence_current(current_date - 1, current_date + 1) $$, $$ values (true) $$, 'a date range containing today is current');
select results_eq($$ select public.is_evidence_current(current_date - 2, current_date - 1) $$, $$ values (false) $$, 'a past date range is not current');
select results_eq($$ select public.has_current_approved_evidence('72000000-0000-0000-0000-000000000002') $$, $$ values (true) $$, 'the current approved proof qualifies');
select results_eq($$ select public.has_current_approved_evidence('72000000-0000-0000-0000-000000000003') $$, $$ values (false) $$, 'the expired approved proof no longer qualifies');
select results_eq($$ select public.is_product_publicly_listed('72000000-0000-0000-0000-000000000002') $$, $$ values (true) $$, 'all current gates make a product public');
select results_eq($$ select public.is_product_publicly_listed('72000000-0000-0000-0000-000000000003') $$, $$ values (false) $$, 'expiry withdraws a product immediately even before cleanup');
select results_eq($$ select public.is_product_publicly_listed('72000000-0000-0000-0000-000000000004') $$, $$ values (false) $$, 'future validity cannot publish a product early');

set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
select results_eq($$ select count(*)::bigint from public.products where id = '72000000-0000-0000-0000-000000000002' $$, $$ values (1::bigint) $$, 'anonymous visitors can read the currently trusted product');
select results_eq($$ select count(*)::bigint from public.products where id in ('72000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000004') $$, $$ values (0::bigint) $$, 'anonymous visitors cannot read expired or not-yet-valid products');
select results_eq($$ select count(*)::bigint from public.search_public_catalog(requested_query => 'produit courant') $$, $$ values (1::bigint) $$, 'catalog search uses the same current-evidence gate');
select is_empty($$ select product_id from public.search_public_catalog(requested_query => 'produit expire') $$, 'search cannot leak an expired listing');
reset role;

-- Checkout gate and expiry cleanup ------------------------------------------

insert into public.orders (id, customer_id, checkout_token, status, expires_at) values
  ('76000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000004', '76000000-0000-0000-0000-000000000011', 'pending_payment', now() + interval '15 minutes'),
  ('76000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000004', '76000000-0000-0000-0000-000000000012', 'pending_payment', now() + interval '15 minutes');

set local "request.jwt.claims" = '{"sub":"70000000-0000-0000-0000-000000000004","role":"authenticated"}';
select lives_ok(
  $$ insert into public.inventory_reservations (order_id, variant_id, quantity, expires_at) values ('76000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000002', 1, now() + interval '15 minutes') $$,
  'checkout reservation accepts a currently trusted variant'
);
select throws_ok(
  $$ insert into public.inventory_reservations (order_id, variant_id, quantity, expires_at) values ('76000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000003', 1, now() + interval '15 minutes') $$,
  '22023', 'variant_not_orderable',
  'checkout reservation rejects a variant whose evidence expired'
);
reset "request.jwt.claims";

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ select public.expire_due_product_evidence() $$, '42501', 'operator_or_service_role_required', 'a seller cannot run the trust expiry worker');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"70000000-0000-0000-0000-000000000003","role":"authenticated"}';
select results_eq($$ select public.expire_due_product_evidence() $$, $$ values (1) $$, 'an operator can expire exactly the due proof');
reset role;
select results_eq($$ select status::text from public.product_evidence where id = '74000000-0000-0000-0000-000000000003' $$, $$ values ('expired'::text) $$, 'cleanup persists the expired evidence state');
select results_eq($$ select status::text from public.products where id = '72000000-0000-0000-0000-000000000003' $$, $$ values ('rejected'::text) $$, 'cleanup returns a product with no current proof to correction');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"70000000-0000-0000-0000-000000000003","role":"authenticated"}';
select results_eq($$ select public.expire_due_product_evidence() $$, $$ values (0) $$, 'expiry cleanup is idempotent');
reset role;

select * from finish();
rollback;
