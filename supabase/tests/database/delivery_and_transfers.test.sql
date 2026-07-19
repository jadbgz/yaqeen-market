begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(39);

select has_table('public', 'delivery_confirmations', 'delivery confirmation ledger exists');
select has_column('public', 'payment_transfers', 'last_error_code', 'transfer failures are reconcilable');
select has_function('public', 'confirm_shop_order_delivery', array['uuid','text'], 'delivery confirmation boundary exists');
select has_function('public', 'prepare_payment_transfer', array['uuid','text'], 'transfer preparation boundary exists');
select has_function('public', 'complete_payment_transfer', array['uuid','text','bigint','text','text'], 'transfer completion boundary exists');
select policies_are('public', 'delivery_confirmations', array['delivery_confirmations_operator_read']);
select results_eq(
  $$ select has_function_privilege('authenticated', 'public.confirm_shop_order_delivery(uuid,text)', 'EXECUTE') $$,
  $$ values (true) $$, 'operators reach delivery confirmation through authenticated role'
);
select results_eq(
  $$ select has_function_privilege('authenticated', 'public.prepare_payment_transfer(uuid,text)', 'EXECUTE') $$,
  $$ values (false) $$, 'authenticated users cannot prepare money movement'
);
select results_eq(
  $$ select has_function_privilege('service_role', 'public.prepare_payment_transfer(uuid,text)', 'EXECUTE') $$,
  $$ values (true) $$, 'only trusted backend can prepare money movement'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.payment_transfers', 'INSERT') $$,
  $$ values (false) $$, 'clients cannot forge transfer ledger rows'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.delivery_confirmations', 'INSERT') $$,
  $$ values (false) $$, 'clients cannot forge delivery evidence'
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('60000000-0000-4000-8000-000000000001', 'delivery-seller@yaqeen.local', '{"display_name":"Seller"}'),
  ('60000000-0000-4000-8000-000000000002', 'delivery-customer@yaqeen.local', '{"display_name":"Customer"}'),
  ('60000000-0000-4000-8000-000000000003', 'delivery-operator@yaqeen.local', '{"display_name":"Operator"}'),
  ('60000000-0000-4000-8000-000000000004', 'delivery-outsider@yaqeen.local', '{"display_name":"Outsider"}');
update public.profiles set role = 'seller' where id = '60000000-0000-4000-8000-000000000001';
update public.profiles set role = 'operator' where id = '60000000-0000-4000-8000-000000000003';

insert into public.shops (id, owner_id, slug, name, description, status, ships_from_country)
values ('61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'delivery-shop', 'Delivery Shop', 'Boutique du test de libération.', 'approved', 'FR');
insert into public.shop_members (shop_id, user_id, member_role)
values ('61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'owner');
insert into public.shop_payment_accounts (
  shop_id, provider_account_id, status, transfers_enabled, connected_at, last_synced_at
) values (
  '61000000-0000-4000-8000-000000000001', 'acct_DeliveryTest01', 'enabled', true, now(), now()
);
insert into public.orders (
  id, customer_id, checkout_token, status, currency, subtotal_cents, shipping_cents,
  total_cents, expires_at, paid_at
) values (
  '62000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002',
  '62100000-0000-4000-8000-000000000001', 'shipped', 'EUR', 5000, 0, 5000,
  now() + interval '15 minutes', now()
);
insert into public.shop_orders (
  id, order_id, shop_id, status, currency, subtotal_cents, shipping_cents,
  commission_cents, total_cents, tracking_number, shipping_carrier, shipped_at
) values (
  '63000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001', 'shipped', 'EUR', 5000, 0, 500, 5000,
  'DELIVERY-TRACK-01', 'Colissimo', now()
);
insert into public.payment_attempts (
  id, order_id, attempt_number, provider_payment_intent_id, provider_charge_id,
  idempotency_key, status, amount_cents, currency, succeeded_at
) values (
  '64000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', 1,
  'pi_DeliveryTest01', 'ch_DeliveryTest01', 'payment:delivery:test:attempt:01',
  'succeeded', 5000, 'EUR', now()
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.confirm_shop_order_delivery('63000000-0000-4000-8000-000000000001', 'Le vendeur prétend avoir livré.') $$,
  '42501', 'operator_required', 'seller cannot self-confirm delivery'
);
select results_eq($$ select count(*)::bigint from public.delivery_confirmations $$, $$ values (0::bigint) $$,
  'seller cannot read the operator evidence ledger');
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.confirm_shop_order_delivery('63000000-0000-4000-8000-000000000001', 'Le client prétend avoir reçu.') $$,
  '42501', 'operator_required', 'customer cannot confirm through operator boundary'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ select public.confirm_shop_order_delivery('63000000-0000-4000-8000-000000000001', 'court') $$,
  '22023', 'invalid_delivery_rationale', 'operator rationale must be substantive'
);
select throws_ok(
  $$ update public.shop_orders set status = 'delivered' where id = '63000000-0000-4000-8000-000000000001' $$,
  '42501', 'permission denied for table shop_orders', 'operator cannot bypass the transition RPC'
);
select results_eq(
  $$ select public.confirm_shop_order_delivery(
    '63000000-0000-4000-8000-000000000001',
    'Suivi transporteur contrôlé par un opérateur Yaqeen.'
  ) $$,
  $$ values ('delivered'::text) $$, 'operator confirms delivery once'
);
select results_eq(
  $$ select status::text, delivered_at is not null from public.shop_orders
     where id = '63000000-0000-4000-8000-000000000001' $$,
  $$ values ('delivered'::text, true) $$, 'delivery state and timestamp are atomic'
);
select results_eq(
  $$ select count(*)::bigint from public.delivery_confirmations
     where shop_order_id = '63000000-0000-4000-8000-000000000001'
       and confirmed_by = '60000000-0000-4000-8000-000000000003' $$,
  $$ values (1::bigint) $$, 'confirmation retains its operator'
);
select results_eq(
  $$ select count(*)::bigint from public.order_events
     where entity_id = '63000000-0000-4000-8000-000000000001'
       and reason = 'delivery_confirmed_by_operator' $$,
  $$ values (1::bigint) $$, 'delivery transition is audited'
);
select results_eq(
  $$ select public.confirm_shop_order_delivery(
    '63000000-0000-4000-8000-000000000001',
    'Suivi transporteur contrôlé par un opérateur Yaqeen.'
  ) $$,
  $$ values ('duplicate'::text) $$, 'delivery confirmation replay is idempotent'
);
reset role;

select results_eq(
  $$ select status::text from public.orders where id = '62000000-0000-4000-8000-000000000001' $$,
  $$ values ('delivered'::text) $$, 'aggregate order is delivered after every shop order'
);

set local role service_role;
select results_eq(
  $$ select transfer_amount_cents, transfer_currency, provider_account_id, provider_charge_id
     from public.prepare_payment_transfer(
       '63000000-0000-4000-8000-000000000001', 'transfer:delivery:test:release:v1'
     ) $$,
  $$ values (4500::bigint, 'EUR'::text, 'acct_DeliveryTest01'::text, 'ch_DeliveryTest01'::text) $$,
  'trusted backend freezes the exact net transfer and Stripe endpoints'
);
select results_eq(
  $$ select count(*)::bigint from public.payment_transfers
     where shop_order_id = '63000000-0000-4000-8000-000000000001' $$,
  $$ values (1::bigint) $$, 'one ledger row exists per shop order'
);
select results_eq(
  $$ select gross_cents, commission_cents, transfer_cents, status::text
     from public.payment_transfers where shop_order_id = '63000000-0000-4000-8000-000000000001' $$,
  $$ values (5000::bigint, 500::bigint, 4500::bigint, 'pending'::text) $$,
  'gross, commission and seller net reconcile'
);
reset role;
update public.shop_payment_accounts
set status = 'restricted', transfers_enabled = false
where shop_id = '61000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok(
  $$ select * from public.prepare_payment_transfer(
    '63000000-0000-4000-8000-000000000001', 'transfer:delivery:test:release:v1'
  ) $$,
  '55000', 'seller_transfer_account_required', 'a disabled destination blocks a pending release retry'
);
reset role;
update public.shop_payment_accounts
set status = 'enabled', transfers_enabled = true
where shop_id = '61000000-0000-4000-8000-000000000001';
set local role service_role;
select lives_ok(
  $$ select * from public.prepare_payment_transfer(
    '63000000-0000-4000-8000-000000000001', 'transfer:delivery:test:release:v1'
  ) $$, 'transfer preparation replay is idempotent'
);
select throws_ok(
  $$ select * from public.prepare_payment_transfer(
    '63000000-0000-4000-8000-000000000001', 'transfer:delivery:test:another-key'
  ) $$,
  '23505', 'transfer_idempotency_conflict', 'a shop order cannot be rebound to another transfer key'
);
select lives_ok(
  $$ select public.record_payment_transfer_error(
    (select id from public.payment_transfers where shop_order_id = '63000000-0000-4000-8000-000000000001'),
    'api_connection_error'
  ) $$, 'transient provider error is recorded for reconciliation'
);
select results_eq(
  $$ select last_error_code from public.payment_transfers
     where shop_order_id = '63000000-0000-4000-8000-000000000001' $$,
  $$ values ('api_connection_error'::text) $$, 'error code is retained without leaking raw error text'
);
select throws_ok(
  $$ select public.complete_payment_transfer(
    (select id from public.payment_transfers where shop_order_id = '63000000-0000-4000-8000-000000000001'),
    'tr_DeliveryTest01', 4400, 'EUR', 'acct_DeliveryTest01'
  ) $$,
  '23514', 'stripe_transfer_reconciliation_failed', 'amount mismatch blocks completion'
);
select throws_ok(
  $$ select public.complete_payment_transfer(
    (select id from public.payment_transfers where shop_order_id = '63000000-0000-4000-8000-000000000001'),
    'tr_DeliveryTest01', 4500, 'USD', 'acct_DeliveryTest01'
  ) $$,
  '23514', 'stripe_transfer_reconciliation_failed', 'currency mismatch blocks completion'
);
select throws_ok(
  $$ select public.complete_payment_transfer(
    (select id from public.payment_transfers where shop_order_id = '63000000-0000-4000-8000-000000000001'),
    'tr_DeliveryTest01', 4500, 'EUR', 'acct_OtherAccount99'
  ) $$,
  '23514', 'stripe_transfer_reconciliation_failed', 'destination mismatch blocks completion'
);
select results_eq(
  $$ select public.complete_payment_transfer(
    (select id from public.payment_transfers where shop_order_id = '63000000-0000-4000-8000-000000000001'),
    'tr_DeliveryTest01', 4500, 'eur', 'acct_DeliveryTest01'
  ) $$,
  $$ values ('submitted'::text) $$, 'verified Stripe transfer is submitted'
);
select results_eq(
  $$ select status::text, provider_transfer_id, submitted_at is not null, last_error_code
     from public.payment_transfers where shop_order_id = '63000000-0000-4000-8000-000000000001' $$,
  $$ values ('submitted'::text, 'tr_DeliveryTest01'::text, true, null::text) $$,
  'completion stores identity and clears transient error atomically'
);
select results_eq(
  $$ select public.complete_payment_transfer(
    (select id from public.payment_transfers where shop_order_id = '63000000-0000-4000-8000-000000000001'),
    'tr_DeliveryTest01', 4500, 'EUR', 'acct_DeliveryTest01'
  ) $$,
  $$ values ('duplicate'::text) $$, 'completion replay is idempotent'
);
select throws_ok(
  $$ select public.complete_payment_transfer(
    (select id from public.payment_transfers where shop_order_id = '63000000-0000-4000-8000-000000000001'),
    'tr_DeliveryOther99', 4500, 'EUR', 'acct_DeliveryTest01'
  ) $$,
  '23514', 'stripe_transfer_identity_conflict', 'provider transfer identity cannot be replaced'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"60000000-0000-4000-8000-000000000004","role":"authenticated"}';
select results_eq($$ select count(*)::bigint from public.payment_transfers $$, $$ values (0::bigint) $$,
  'outsider cannot read transfer ledger');
select results_eq($$ select count(*)::bigint from public.delivery_confirmations $$, $$ values (0::bigint) $$,
  'outsider cannot read delivery confirmation ledger');
reset role;

select * from finish();
rollback;
