begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(78);

select has_type('public', 'connected_payment_account_status', 'connected payment account status enum exists');
select has_type('public', 'payment_attempt_status', 'payment attempt status enum exists');
select has_type('public', 'payment_transfer_status', 'payment transfer status enum exists');
select has_type('public', 'webhook_event_status', 'webhook event status enum exists');
select has_table('public', 'shop_payment_accounts', 'shop payment accounts table exists');
select has_table('public', 'payment_attempts', 'payment attempts table exists');
select has_table('public', 'payment_transfers', 'payment transfers table exists');
select has_table('public', 'stripe_webhook_events', 'Stripe webhook event ledger exists');
select has_column('public', 'payment_attempts', 'provider_charge_id', 'payment attempts retain the reconciled charge identifier');
select has_function(
  'public', 'apply_stripe_payment_intent_state',
  array['text','text','bigint','text','text','text'],
  'the trusted Stripe state transition exists'
);
select has_trigger(
  'public', 'payment_attempts', 'payment_attempts_require_ready_sellers',
  'payment creation requires every seller to have a transfer-ready account'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('shop_payment_accounts', 'payment_attempts', 'payment_transfers', 'stripe_webhook_events')
      and c.relrowsecurity
  $$,
  $$ values (4::bigint) $$,
  'RLS is enabled on every payment domain table'
);

select policies_are('public', 'shop_payment_accounts', array['shop_payment_accounts_party_read']);
select policies_are('public', 'payment_attempts', array['payment_attempts_operator_read']);
select policies_are('public', 'payment_transfers', array['payment_transfers_seller_or_operator_read']);
select policies_are('public', 'stripe_webhook_events', array['stripe_webhook_events_operator_read']);

select has_index('public', 'shop_payment_accounts', 'shop_payment_accounts_status_idx', 'account remediation queue has an index');
select has_index('public', 'payment_attempts', 'payment_attempts_order_status_idx', 'order payment history has an index');
select has_index('public', 'payment_transfers', 'payment_transfers_shop_status_idx', 'seller transfer ledger has an index');
select has_index('public', 'stripe_webhook_events', 'stripe_webhook_events_processing_idx', 'webhook processing queue has an index');

select results_eq(
  $$ select has_table_privilege('authenticated', 'public.shop_payment_accounts', 'INSERT') $$,
  $$ values (false) $$,
  'sellers cannot forge their Stripe account state'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.payment_attempts', 'INSERT') $$,
  $$ values (false) $$,
  'clients cannot forge payment attempts'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.payment_attempts', 'UPDATE') $$,
  $$ values (false) $$,
  'clients cannot declare payment success'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.stripe_webhook_events', 'INSERT') $$,
  $$ values (false) $$,
  'clients cannot forge Stripe webhook events'
);

select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'sync_stripe_payment_account', 'create_payment_attempt', 'attach_stripe_payment_intent',
         'register_stripe_webhook_event', 'claim_stripe_webhook_event', 'complete_stripe_webhook_event',
         'apply_stripe_payment_intent_state'
       ) and p.prosecdef $$,
  $$ values (7::bigint) $$,
  'all seven payment boundaries are security-definer functions'
);
select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'sync_stripe_payment_account', 'create_payment_attempt', 'attach_stripe_payment_intent',
         'register_stripe_webhook_event', 'claim_stripe_webhook_event', 'complete_stripe_webhook_event',
         'apply_stripe_payment_intent_state'
       ) and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  $$ values (0::bigint) $$,
  'anonymous sessions cannot execute payment boundaries'
);
select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'sync_stripe_payment_account', 'create_payment_attempt', 'attach_stripe_payment_intent',
         'register_stripe_webhook_event', 'claim_stripe_webhook_event', 'complete_stripe_webhook_event',
         'apply_stripe_payment_intent_state'
       ) and has_function_privilege('authenticated', p.oid, 'EXECUTE') $$,
  $$ values (0::bigint) $$,
  'authenticated sessions cannot execute payment boundaries'
);
select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'sync_stripe_payment_account', 'create_payment_attempt', 'attach_stripe_payment_intent',
         'register_stripe_webhook_event', 'claim_stripe_webhook_event', 'complete_stripe_webhook_event',
         'apply_stripe_payment_intent_state'
       ) and has_function_privilege('service_role', p.oid, 'EXECUTE') $$,
  $$ values (7::bigint) $$,
  'only the trusted service can reach every payment boundary'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('30000000-0000-0000-0000-000000000001', 'payment-seller@yaqeen.local', '{"display_name":"Payment Seller"}'),
  ('30000000-0000-0000-0000-000000000002', 'payment-customer@yaqeen.local', '{"display_name":"Payment Customer"}'),
  ('30000000-0000-0000-0000-000000000003', 'payment-outsider@yaqeen.local', '{"display_name":"Payment Outsider"}'),
  ('30000000-0000-0000-0000-000000000004', 'payment-operator@yaqeen.local', '{"display_name":"Payment Operator"}');

update public.profiles set role = 'seller' where id = '30000000-0000-0000-0000-000000000001';
update public.profiles set role = 'operator' where id = '30000000-0000-0000-0000-000000000004';

insert into public.shops (id, owner_id, slug, name, description, status, ships_from_country)
values (
  '31000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'payment-shop',
  'Payment Shop',
  'Boutique approuvée pour les tests du registre de paiement.',
  'approved',
  'FR'
);
insert into public.shop_members (shop_id, user_id, member_role)
values ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'owner');

insert into public.products (id, shop_id, slug, title, description, category, status, published_at)
values (
  '32000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  'payment-product',
  'Produit paiement',
  'Produit publié utilisé pour valider le registre de paiement.',
  'parfums',
  'published',
  now()
);
insert into public.product_variants (
  id, product_id, sku, title, price_cents, currency, stock_on_hand, stock_reserved, active
) values (
  '33000000-0000-4000-8000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  'PAYMENT-01',
  'Format paiement',
  1000,
  'EUR',
  2,
  1,
  true
);
insert into public.product_evidence (
  product_id, kind, status, scope, public_summary, submitted_by, reviewed_by, reviewed_at
) values (
  '32000000-0000-0000-0000-000000000001',
  'seller_declaration',
  'approved',
  'Déclaration couvrant le produit du scénario de paiement.',
  'Preuve approuvée pour le scénario de paiement automatisé.',
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000004',
  now()
);

insert into public.orders (
  id, customer_id, checkout_token, status, currency, subtotal_cents, shipping_cents, total_cents, expires_at
) values (
  '34000000-0000-4000-8000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  '34100000-0000-4000-8000-000000000001',
  'pending_payment',
  'EUR',
  1000,
  0,
  1000,
  now() + interval '15 minutes'
);
insert into public.shop_orders (
  id, order_id, shop_id, status, currency, subtotal_cents, shipping_cents, commission_cents, total_cents
) values (
  '35000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  'pending_payment',
  'EUR',
  1000,
  0,
  0,
  1000
);
insert into public.order_items (
  shop_order_id, product_id, variant_id, product_title, variant_title, sku, unit_price_cents, quantity
) values (
  '35000000-0000-4000-8000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  '33000000-0000-4000-8000-000000000001',
  'Produit paiement',
  'Format paiement',
  'PAYMENT-01',
  1000,
  1
);
insert into public.inventory_reservations (order_id, variant_id, quantity, status, expires_at)
values (
  '34000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000001',
  1,
  'active',
  now() + interval '15 minutes'
);

set local role service_role;
select throws_ok(
  $$ select public.create_payment_attempt(
    '34000000-0000-4000-8000-000000000001',
    'payment:34000000:account:not-ready'
  ) $$,
  '55000', 'seller_payment_account_required',
  'checkout stays closed until every seller can receive transfers'
);
reset role;

set local role service_role;
select lives_ok(
  $$ select public.sync_stripe_payment_account(
    '31000000-0000-0000-0000-000000000001',
    'acct_1234567890',
    'enabled',
    true,
    0
  ) $$,
  'the service synchronizes an enabled connected account'
);
reset role;

select results_eq(
  $$ select provider_account_id, status::text, transfers_enabled, requirements_due_count
     from public.shop_payment_accounts where shop_id = '31000000-0000-0000-0000-000000000001' $$,
  $$ values ('acct_1234567890'::text, 'enabled'::text, true, 0) $$,
  'connected account state is persisted without identity documents'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.shop_payment_accounts $$,
  $$ values (1::bigint) $$,
  'the seller can read their own onboarding and transfer capability state'
);
select results_eq(
  $$ select count(*)::bigint from public.payment_attempts $$,
  $$ values (0::bigint) $$,
  'the seller cannot read customer payment attempts'
);
select throws_ok(
  $$ insert into public.shop_payment_accounts (shop_id, provider_account_id, status, transfers_enabled, connected_at)
     values ('31000000-0000-0000-0000-000000000001', 'acct_forged1234', 'enabled', true, now()) $$,
  '42501', 'permission denied for table shop_payment_accounts',
  'the seller cannot forge a connected account state directly'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.shop_payment_accounts $$,
  $$ values (0::bigint) $$,
  'an outsider cannot read another shop payment account'
);
reset role;

set local role service_role;
select lives_ok(
  $$ select public.create_payment_attempt(
    '34000000-0000-4000-8000-000000000001',
    'payment:34000000:attempt:1'
  ) $$,
  'the service creates a payment attempt from a payable reserved order'
);
reset role;

select results_eq(
  $$ select attempt_number, status::text, amount_cents, currency::text, provider_payment_intent_id
     from public.payment_attempts where order_id = '34000000-0000-4000-8000-000000000001' $$,
  $$ values (1::smallint, 'requires_payment_method'::text, 1000::bigint, 'EUR'::text, null::text) $$,
  'payment amount and currency are snapshotted from the server-side order'
);

set local role service_role;
select results_eq(
  $$ select public.create_payment_attempt(
    '34000000-0000-4000-8000-000000000001',
    'payment:34000000:attempt:1'
  ) $$,
  $$ select id from public.payment_attempts where idempotency_key = 'payment:34000000:attempt:1' $$,
  'replaying the same idempotency key returns the original attempt'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from public.payment_attempts where order_id = '34000000-0000-4000-8000-000000000001' $$,
  $$ values (1::bigint) $$,
  'an idempotent replay does not create a duplicate payment attempt'
);

set local role service_role;
select throws_ok(
  $$ select public.create_payment_attempt(
    '34000000-0000-4000-8000-000000000001',
    'payment:34000000:attempt:2'
  ) $$,
  '55000', 'active_payment_attempt_exists',
  'a second active attempt cannot race the first one'
);
select lives_ok(
  $$ select public.attach_stripe_payment_intent(
    (select id from public.payment_attempts where idempotency_key = 'payment:34000000:attempt:1'),
    'pi_1234567890'
  ) $$,
  'the service attaches the Stripe PaymentIntent identifier'
);
reset role;
select results_eq(
  $$ select provider_payment_intent_id from public.payment_attempts where idempotency_key = 'payment:34000000:attempt:1' $$,
  $$ values ('pi_1234567890'::text) $$,
  'the PaymentIntent identifier is persisted for reconciliation'
);

set local role service_role;
select throws_ok(
  $$ select public.attach_stripe_payment_intent(
    (select id from public.payment_attempts where idempotency_key = 'payment:34000000:attempt:1'),
    'pi_0987654321'
  ) $$,
  '55000', 'payment_intent_already_attached',
  'an attempt cannot be rebound to another PaymentIntent'
);
select results_eq(
  $$ select public.register_stripe_webhook_event(
    'evt_1234567890',
    'payment_intent.succeeded',
    'pi_1234567890',
    false,
    '2026-06-30',
    repeat('a', 64)
  ) $$,
  $$ values (true) $$,
  'the first signed event registration is new'
);
select results_eq(
  $$ select public.register_stripe_webhook_event(
    'evt_1234567890',
    'payment_intent.succeeded',
    'pi_1234567890',
    false,
    '2026-06-30',
    repeat('a', 64)
  ) $$,
  $$ values (false) $$,
  'a duplicate Stripe event is acknowledged without replaying effects'
);
reset role;

select results_eq(
  $$ select delivery_count, status::text from public.stripe_webhook_events where provider_event_id = 'evt_1234567890' $$,
  $$ values (2, 'received'::text) $$,
  'duplicate deliveries increment observability without changing processing state'
);

set local role service_role;
select throws_ok(
  $$ select public.register_stripe_webhook_event(
    'evt_1234567890',
    'payment_intent.payment_failed',
    'pi_1234567890',
    false,
    '2026-06-30',
    repeat('b', 64)
  ) $$,
  '23514', 'stripe_event_identity_conflict',
  'a reused event identifier with conflicting content is rejected'
);
reset role;

set local role service_role;
select results_eq(
  $$ select public.claim_stripe_webhook_event('evt_1234567890') $$,
  $$ values (true) $$,
  'the worker atomically claims an unprocessed event'
);
select results_eq(
  $$ select public.claim_stripe_webhook_event('evt_1234567890') $$,
  $$ values (false) $$,
  'a processing event cannot be claimed concurrently'
);
select lives_ok(
  $$ select public.complete_stripe_webhook_event('evt_1234567890', 'processed', null) $$,
  'the worker completes a claimed event'
);
reset role;

select results_eq(
  $$ select status::text, processing_attempts, processing_started_at is null, processed_at is not null, last_error_code
     from public.stripe_webhook_events where provider_event_id = 'evt_1234567890' $$,
  $$ values ('processed'::text, 1, true, true, null::text) $$,
  'processed webhook state is terminal and auditable'
);

set local role service_role;
select results_eq(
  $$ select public.claim_stripe_webhook_event('evt_1234567890') $$,
  $$ values (false) $$,
  'a processed event cannot be claimed again'
);
select throws_ok(
  $$ select public.register_stripe_webhook_event(
    'evt_invalidhash1', 'payment_intent.failed', 'pi_1234567890', false, '2026-06-30', 'not-a-hash'
  ) $$,
  '22023', 'invalid_stripe_payload_hash',
  'the ledger rejects an invalid payload fingerprint'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.register_stripe_webhook_event(
    'evt_forged12345', 'payment_intent.succeeded', 'pi_1234567890', false, '2026-06-30', repeat('b', 64)
  ) $$,
  '42501', 'permission denied for function register_stripe_webhook_event',
  'an authenticated client cannot forge a webhook through the RPC'
);
select results_eq(
  $$ select count(*)::bigint from public.payment_attempts $$,
  $$ values (0::bigint) $$,
  'the customer cannot read the internal payment attempt ledger'
);
reset role;

insert into public.payment_transfers (
  payment_attempt_id,
  shop_order_id,
  shop_id,
  idempotency_key,
  status,
  gross_cents,
  commission_cents,
  transfer_cents,
  currency
) values (
  (select id from public.payment_attempts where idempotency_key = 'payment:34000000:attempt:1'),
  '35000000-0000-4000-8000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  'transfer:35000000:attempt:1',
  'pending',
  1000,
  100,
  900,
  'EUR'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.payment_transfers $$,
  $$ values (1::bigint) $$,
  'the seller can read only their own transfer ledger'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.payment_transfers $$,
  $$ values (0::bigint) $$,
  'an outsider cannot read seller transfers'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.payment_transfers $$,
  $$ values (0::bigint) $$,
  'the customer cannot see the seller commission split'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000004","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.payment_attempts $$,
  $$ values (1::bigint) $$,
  'an operator can audit the payment attempt ledger'
);
select results_eq(
  $$ select count(*)::bigint from public.stripe_webhook_events $$,
  $$ values (1::bigint) $$,
  'an operator can audit webhook processing state'
);
reset role;

insert into public.orders (
  id, customer_id, checkout_token, status, currency, subtotal_cents, shipping_cents, total_cents, expires_at
) values (
  '34000000-0000-4000-8000-000000000002',
  '30000000-0000-0000-0000-000000000002',
  '34100000-0000-4000-8000-000000000002',
  'pending_payment',
  'EUR',
  500,
  0,
  500,
  now() - interval '1 minute'
);

set local role service_role;
select throws_ok(
  $$ select public.create_payment_attempt(
    '34000000-0000-4000-8000-000000000002',
    'payment:34000000:expired:1'
  ) $$,
  '55000', 'order_not_payable',
  'an expired order cannot start a payment attempt'
);
reset role;

set local role service_role;
select throws_ok(
  $$ select public.apply_stripe_payment_intent_state(
    'pi_1234567890', 'processing', 999, 'EUR', null, null
  ) $$,
  '23514', 'stripe_payment_amount_mismatch',
  'a webhook cannot alter the server-side payment amount'
);
select results_eq(
  $$ select public.apply_stripe_payment_intent_state(
    'pi_1234567890', 'processing', 1000, 'eur', null, null
  ) $$,
  $$ values ('processing'::text) $$,
  'a verified processing intent advances the local attempt'
);
reset role;

select results_eq(
  $$ select status::text, last_error_code from public.payment_attempts
     where provider_payment_intent_id = 'pi_1234567890' $$,
  $$ values ('processing'::text, null::text) $$,
  'processing state is persisted without exposing it to the customer'
);

set local role service_role;
select throws_ok(
  $$ select public.apply_stripe_payment_intent_state(
    'pi_1234567890', 'succeeded', 1000, 'EUR', null, null
  ) $$,
  '22023', 'succeeded_payment_requires_charge',
  'a success without a reconciled charge is rejected'
);
select results_eq(
  $$ select public.apply_stripe_payment_intent_state(
    'pi_1234567890', 'succeeded', 1000, 'eur', 'ch_1234567890', null
  ) $$,
  $$ values ('paid'::text) $$,
  'a verified success atomically pays the order'
);
reset role;

select results_eq(
  $$ select status::text, provider_charge_id, succeeded_at is not null
     from public.payment_attempts where provider_payment_intent_id = 'pi_1234567890' $$,
  $$ values ('succeeded'::text, 'ch_1234567890'::text, true) $$,
  'the attempt retains its terminal state and charge identifier'
);
select results_eq(
  $$ select status::text, paid_at is not null from public.orders
     where id = '34000000-0000-4000-8000-000000000001' $$,
  $$ values ('paid'::text, true) $$,
  'the aggregate order is paid only by the trusted transition'
);
select results_eq(
  $$ select status::text from public.shop_orders
     where id = '35000000-0000-4000-8000-000000000001' $$,
  $$ values ('paid'::text) $$,
  'every seller sub-order advances with the aggregate'
);
select results_eq(
  $$ select status::text, released_at is null from public.inventory_reservations
     where order_id = '34000000-0000-4000-8000-000000000001' $$,
  $$ values ('consumed'::text, true) $$,
  'the paid reservation is consumed rather than released'
);
select results_eq(
  $$ select stock_on_hand, stock_reserved from public.product_variants
     where id = '33000000-0000-4000-8000-000000000001' $$,
  $$ values (1, 0) $$,
  'stock on hand and reserved stock move atomically on payment'
);
select results_eq(
  $$ select count(*)::bigint from public.order_events
     where entity_type = 'order'
       and entity_id = '34000000-0000-4000-8000-000000000001'
       and to_status = 'paid'
       and reason = 'stripe_payment_intent_succeeded' $$,
  $$ values (1::bigint) $$,
  'the payment transition leaves one aggregate audit event'
);

set local role service_role;
select results_eq(
  $$ select public.apply_stripe_payment_intent_state(
    'pi_1234567890', 'succeeded', 1000, 'EUR', 'ch_1234567890', null
  ) $$,
  $$ values ('duplicate'::text) $$,
  'a semantic duplicate cannot consume stock twice'
);
select throws_ok(
  $$ select public.apply_stripe_payment_intent_state(
    'pi_1234567890', 'succeeded', 1000, 'EUR', 'ch_0987654321', null
  ) $$,
  '23514', 'stripe_charge_identity_conflict',
  'a duplicate intent cannot be rebound to another charge'
);
select results_eq(
  $$ select public.apply_stripe_payment_intent_state(
    'pi_1234567890', 'processing', 1000, 'EUR', null, null
  ) $$,
  $$ values ('stale'::text) $$,
  'an out-of-order event cannot downgrade a paid attempt'
);
reset role;

select results_eq(
  $$ select stock_on_hand, stock_reserved from public.product_variants
     where id = '33000000-0000-4000-8000-000000000001' $$,
  $$ values (1, 0) $$,
  'duplicate and stale events leave stock unchanged'
);
select results_eq(
  $$ select count(*)::bigint from public.order_events
     where entity_type = 'order'
       and entity_id = '34000000-0000-4000-8000-000000000001'
       and to_status = 'paid' $$,
  $$ values (1::bigint) $$,
  'duplicate events do not duplicate audit history'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.apply_stripe_payment_intent_state(
    'pi_1234567890', 'processing', 1000, 'EUR', null, null
  ) $$,
  '42501', 'permission denied for function apply_stripe_payment_intent_state',
  'a customer cannot invoke the trusted payment transition'
);
reset role;

select * from finish();
rollback;
