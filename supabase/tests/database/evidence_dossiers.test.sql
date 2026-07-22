begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(42);

-- Schema, bucket and privilege boundary ------------------------------------

select has_table('public', 'product_evidence_documents', 'private evidence document registry exists');
select has_index('public', 'product_evidence_documents', 'product_evidence_documents_evidence_idx', 'document lookup is indexed');
select results_eq($$ select relrowsecurity from pg_class where oid = 'public.product_evidence_documents'::regclass $$, $$ values (true) $$, 'document RLS is enabled');
select results_eq($$ select public from storage.buckets where id = 'product-evidence' $$, $$ values (false) $$, 'evidence bucket is private');
select results_eq($$ select file_size_limit from storage.buckets where id = 'product-evidence' $$, $$ values (10485760::bigint) $$, 'bucket enforces the ten megabyte ceiling');
select results_eq($$ select allowed_mime_types from storage.buckets where id = 'product-evidence' $$, $$ values (array['application/pdf']::text[]) $$, 'bucket accepts PDF only');
select results_eq($$ select has_table_privilege('authenticated', 'public.product_evidence_documents', 'INSERT') $$, $$ values (false) $$, 'direct document registration is revoked');
select results_eq($$ select has_table_privilege('authenticated', 'public.product_evidence_documents', 'UPDATE') $$, $$ values (false) $$, 'direct document mutation is revoked');
select results_eq($$ select has_table_privilege('authenticated', 'public.product_evidence_documents', 'DELETE') $$, $$ values (false) $$, 'direct document deletion is revoked');
select results_eq(
  $$ select count(*)::bigint from pg_proc proc join pg_namespace namespace on namespace.oid = proc.pronamespace where namespace.nspname = 'public' and proc.proname in ('register_evidence_document', 'discard_evidence_document', 'review_published_product_evidence') and proc.prosecdef $$,
  $$ values (3::bigint) $$,
  'every dossier mutation is a security-definer boundary'
);
select results_eq(
  $$ select bool_and(has_function_privilege('authenticated', proc.oid, 'EXECUTE')) from pg_proc proc join pg_namespace namespace on namespace.oid = proc.pronamespace where namespace.nspname = 'public' and proc.proname in ('register_evidence_document', 'discard_evidence_document', 'review_published_product_evidence') $$,
  $$ values (true) $$,
  'authenticated actors can reach guarded dossier RPCs'
);
select results_eq(
  $$ select bool_or(has_function_privilege('anon', proc.oid, 'EXECUTE')) from pg_proc proc join pg_namespace namespace on namespace.oid = proc.pronamespace where namespace.nspname = 'public' and proc.proname in ('register_evidence_document', 'discard_evidence_document', 'review_published_product_evidence') $$,
  $$ values (false) $$,
  'anonymous actors cannot reach dossier mutations'
);

-- Actors and public products -----------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('90000000-0000-0000-0000-000000000001', 'dossier-seller@yaqeen.local', '{"display_name":"Dossier Seller"}'),
  ('90000000-0000-0000-0000-000000000002', 'dossier-outsider@yaqeen.local', '{"display_name":"Dossier Outsider"}'),
  ('90000000-0000-0000-0000-000000000003', 'dossier-operator@yaqeen.local', '{"display_name":"Dossier Operator"}');
update public.profiles set role = 'seller' where id = '90000000-0000-0000-0000-000000000001';
update public.profiles set role = 'operator' where id = '90000000-0000-0000-0000-000000000003';

insert into public.shops (id, owner_id, slug, name, description, status, ships_from_country) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'atelier-dossier', 'Atelier Dossier', 'Boutique approuvée pour tester les dossiers confidentiels.', 'approved', 'FR');
insert into public.shop_members (shop_id, user_id, member_role) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'owner');

insert into public.products (id, shop_id, slug, title, description, category, status, verification_summary, published_at) values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'serum-certifie', 'Sérum certifié', 'Description publique suffisamment précise pour un produit couvert.', 'cosmetiques', 'published', 'Ancienne preuve publique toujours valable.', now()),
  ('92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000001', 'huile-sans-document', 'Huile sans document', 'Second produit publié destiné au contrôle documentaire négatif.', 'cosmetiques', 'published', 'Déclaration actuelle encore valable.', now()),
  ('92000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000001', 'brouillon-sans-document', 'Brouillon sans document', 'Brouillon destiné à vérifier le verrou avant soumission à la revue.', 'cosmetiques', 'draft', null, null);
insert into public.product_variants (id, product_id, sku, title, price_cents, stock_on_hand, active) values
  ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'DOSSIER-SERUM', 'Flacon 30 ml', 2900, 10, true),
  ('93000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000002', 'DOSSIER-HUILE', 'Flacon 50 ml', 1900, 10, true);
insert into public.product_evidence (id, product_id, kind, status, scope, public_summary, valid_from, valid_until, submitted_by, reviewed_by, reviewed_at) values
  ('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'seller_declaration', 'approved', 'Ancienne preuve approuvée du produit.', 'Ancienne preuve publique toujours valable.', current_date - 30, current_date + 30, '90000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000003', now()),
  ('94000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000002', 'seller_declaration', 'approved', 'Déclaration actuelle du second produit.', 'Déclaration actuelle encore valable.', current_date - 30, current_date + 30, '90000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000003', now()),
  ('94000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000002', 'third_party_certificate', 'pending', 'Certificat tiers sans aucun fichier binaire.', 'Résumé proposé mais non justifié par un document.', current_date, current_date + 365, '90000000-0000-0000-0000-000000000001', null, null),
  ('94000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000003', 'third_party_certificate', 'pending', 'Certificat tiers de brouillon sans fichier binaire.', 'Résumé du brouillon qui ne doit pas entrer en revue.', current_date, current_date + 365, '90000000-0000-0000-0000-000000000001', null, null);

select throws_ok(
  $$ update public.products set status = 'under_review' where id = '92000000-0000-0000-0000-000000000003' $$,
  '23514', 'reviewable_evidence_document_required',
  'a draft cannot become locked under review before its certificate PDF exists'
);

-- Seller renewal and registration -----------------------------------------

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.add_product_evidence('92000000-0000-0000-0000-000000000001', 'third_party_certificate', 'Certification couvrant la composition et le produit fini.', 'Institut de contrôle', 'CERT-2026-001', 'Nouvelle certification vérifiée pour la composition et le produit fini.', current_date, current_date + 365) $$,
  'a seller can submit a renewal without unpublishing the covered product'
);
reset role;

select results_eq($$ select status::text from public.products where id = '92000000-0000-0000-0000-000000000001' $$, $$ values ('published'::text) $$, 'renewal keeps the product published');
select results_eq($$ select status::text from public.product_evidence where id = '94000000-0000-0000-0000-000000000001' $$, $$ values ('approved'::text) $$, 'the previous evidence remains approved during review');
select results_eq($$ select count(*)::bigint from public.product_evidence where product_id = '92000000-0000-0000-0000-000000000001' and status = 'pending' $$, $$ values (1::bigint) $$, 'one private renewal enters the queue');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.add_product_evidence('92000000-0000-0000-0000-000000000001', 'seller_declaration', 'Tentative de seconde soumission en parallèle.', null, null, 'Deuxième résumé concurrent interdit sur le produit.', current_date, current_date + 30) $$,
  '55000', 'published_evidence_renewal_already_pending',
  'only one renewal can be pending on a published product'
);
select throws_ok(
  $$ select public.register_evidence_document((select id from public.product_evidence where product_id = '92000000-0000-0000-0000-000000000001' and status = 'pending'), 'certificat.pdf', 1024, 'invalid') $$,
  '22023', 'invalid_evidence_document_hash',
  'invalid document fingerprints are rejected'
);
select lives_ok(
  $$ select public.register_evidence_document((select id from public.product_evidence where product_id = '92000000-0000-0000-0000-000000000001' and status = 'pending'), 'certificat_original.pdf', 1024, repeat('a', 64)) $$,
  'the seller can register one confidential PDF'
);
select throws_ok(
  $$ select public.register_evidence_document((select id from public.product_evidence where product_id = '92000000-0000-0000-0000-000000000001' and status = 'pending'), 'double.pdf', 1024, repeat('b', 64)) $$,
  '23505', 'evidence_document_already_exists',
  'a single evidence submission cannot hide multiple competing documents'
);
reset role;

select results_eq($$ select count(*)::bigint from public.product_evidence_documents $$, $$ values (1::bigint) $$, 'the document registry contains exactly one immutable fingerprint');
select results_eq($$ select sha256 from public.product_evidence_documents $$, $$ values (repeat('a', 64)::text) $$, 'the SHA-256 fingerprint is persisted');

-- IDOR and anonymous isolation ---------------------------------------------

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}';
select results_eq($$ select count(*)::bigint from public.product_evidence_documents $$, $$ values (0::bigint) $$, 'an outsider cannot read dossier metadata');
select throws_ok(
  $$ select public.register_evidence_document((select id from public.product_evidence where product_id = '92000000-0000-0000-0000-000000000001' and status = 'pending'), 'attaque.pdf', 1024, repeat('c', 64)) $$,
  '42501', 'evidence_ownership_required',
  'an outsider cannot register a document against another shop evidence'
);
reset role;

set local role anon;
select throws_ok(
  $$ select count(*)::bigint from public.product_evidence_documents $$,
  '42501', 'permission denied for table product_evidence_documents',
  'anonymous visitors cannot read dossier metadata'
);
reset role;

-- Object upload and private review ----------------------------------------

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_like(
  $$ insert into storage.objects (bucket_id, name, owner_id, metadata)
     select storage_bucket, storage_path, '90000000-0000-0000-0000-000000000001'::uuid, '{"mimetype":"application/pdf","size":1024}'::jsonb
     from public.product_evidence_documents $$,
  '%row-level security%',
  'a seller cannot bypass the trusted server and upload arbitrary bytes'
);
reset role;
insert into storage.objects (bucket_id, name, owner_id, metadata)
select storage_bucket, storage_path, '90000000-0000-0000-0000-000000000001'::uuid, '{"mimetype":"application/pdf","size":1024}'::jsonb
from public.product_evidence_documents;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq($$ select count(*)::bigint from storage.objects where bucket_id = 'product-evidence' $$, $$ values (1::bigint) $$, 'the owner can read their private object through storage RLS');
select throws_ok(
  $$ select public.review_published_product_evidence((select id from public.product_evidence where product_id = '92000000-0000-0000-0000-000000000001' and status = 'pending'), 'approved', 'Auto-approbation interdite même avec un document.', 'Résumé public frauduleusement auto-approuvé.') $$,
  '42501', 'operator_role_required',
  'the seller cannot approve their own dossier'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"90000000-0000-0000-0000-000000000003","role":"authenticated"}';
select results_eq($$ select count(*)::bigint from public.product_evidence_documents $$, $$ values (1::bigint) $$, 'an operator can inspect document metadata');
select results_eq($$ select count(*)::bigint from storage.objects where bucket_id = 'product-evidence' $$, $$ values (1::bigint) $$, 'an operator can inspect the private PDF object');
select throws_ok(
  $$ select public.review_published_product_evidence('94000000-0000-0000-0000-000000000003', 'approved', 'Cette approbation doit échouer sans document.', 'Résumé public qui ne doit jamais être approuvé sans pièce.') $$,
  '23514', 'evidence_document_required',
  'a third-party certificate cannot be approved without its binary document'
);
select lives_ok(
  $$ select public.review_published_product_evidence((select id from public.product_evidence where product_id = '92000000-0000-0000-0000-000000000001' and status = 'pending'), 'approved', 'Document, émetteur, référence, dates et périmètre vérifiés.', 'Certification tierce vérifiée pour la composition et le produit fini.') $$,
  'an operator can atomically approve the complete renewal dossier'
);
reset role;

select results_eq($$ select status::text from public.product_evidence where id = '94000000-0000-0000-0000-000000000001' $$, $$ values ('revoked'::text) $$, 'the superseded evidence is revoked only after approval');
select results_eq($$ select count(*)::bigint from public.product_evidence where product_id = '92000000-0000-0000-0000-000000000001' and status = 'approved' $$, $$ values (1::bigint) $$, 'exactly one approved evidence remains');
select results_eq($$ select verification_summary from public.products where id = '92000000-0000-0000-0000-000000000001' $$, $$ values ('Certification tierce vérifiée pour la composition et le produit fini.'::text) $$, 'the reviewed public summary replaces the old one');
select results_eq($$ select count(*)::bigint from public.moderation_decisions where entity_type = 'product_evidence' and decision = 'approved' $$, $$ values (1::bigint) $$, 'the evidence decision is journaled');

set local role anon;
select results_eq($$ select count(*)::bigint from storage.objects where bucket_id = 'product-evidence' $$, $$ values (0::bigint) $$, 'an approved source document never becomes public');
reset role;

-- Rejection and explicit cleanup ------------------------------------------

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.add_product_evidence('92000000-0000-0000-0000-000000000001', 'seller_declaration', 'Nouvelle déclaration à rejeter sans effet sur la preuve courante.', null, null, 'Résumé proposé pour une déclaration qui sera rejetée.', current_date, current_date + 30) $$,
  'a later declaration can enter review'
);
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"90000000-0000-0000-0000-000000000003","role":"authenticated"}';
select lives_ok(
  $$ select public.review_published_product_evidence((select id from public.product_evidence where product_id = '92000000-0000-0000-0000-000000000001' and status = 'pending'), 'rejected', 'Déclaration insuffisante face au certificat déjà approuvé.', null) $$,
  'an operator can reject a renewal without breaking current trust'
);
reset role;
select results_eq($$ select count(*)::bigint from public.product_evidence where product_id = '92000000-0000-0000-0000-000000000001' and status = 'approved' $$, $$ values (1::bigint) $$, 'rejection preserves the current approved evidence');
select results_eq($$ select status::text from public.products where id = '92000000-0000-0000-0000-000000000001' $$, $$ values ('published'::text) $$, 'rejection never unpublishes the product');

select * from finish();
rollback;
