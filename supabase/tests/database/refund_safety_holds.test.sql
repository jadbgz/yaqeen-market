begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

select has_function(
  'public',
  'shop_order_has_active_refund',
  array['uuid'],
  'shared refund hold boundary exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.shop_order_has_active_refund(uuid)',
    'EXECUTE'
  ),
  'clients cannot inspect the internal hold helper directly'
);
select policies_are(
  'public',
  'payment_refunds',
  array['payment_refunds_operator_read'],
  'refund ledger has only the operator read policy'
);
select ok(
  has_table_privilege('authenticated', 'public.payment_refunds', 'SELECT'),
  'authenticated sessions can reach RLS-protected refund reads'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    'hold-seller@yaqeen.local',
    '{"display_name":"Hold Seller"}'
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    'hold-customer@yaqeen.local',
    '{"display_name":"Hold Customer"}'
  ),
  (
    'a0000000-0000-4000-8000-000000000003',
    'hold-operator@yaqeen.local',
    '{"display_name":"Hold Operator"}'
  ),
  (
    'a0000000-0000-4000-8000-000000000004',
    'hold-outsider@yaqeen.local',
    '{"display_name":"Hold Outsider"}'
  );

update public.profiles
set role = 'seller'
where id = 'a0000000-0000-4000-8000-000000000001';

update public.profiles
set role = 'operator'
where id = 'a0000000-0000-4000-8000-000000000003';

insert into public.shops (
  id,
  owner_id,
  slug,
  name,
  description,
  status,
  ships_from_country
) values (
  'a1000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'refund-hold-shop',
  'Refund Hold Shop',
  'Boutique de validation des verrous financiers.',
  'approved',
  'FR'
);

insert into public.shop_members (shop_id, user_id, member_role)
values (
  'a1000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.shop_payment_accounts (
  shop_id,
  provider_account_id,
  status,
  transfers_enabled,
  connected_at,
  last_synced_at
) values (
  'a1000000-0000-4000-8000-000000000001',
  'acct_RefundHoldShop1',
  'enabled',
  true,
  now(),
  now()
);

insert into public.orders (
  id,
  customer_id,
  checkout_token,
  status,
  currency,
  subtotal_cents,
  shipping_cents,
  total_cents,
  expires_at,
  paid_at
) values (
  'a2000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'a2100000-0000-4000-8000-000000000001',
  'processing',
  'EUR',
  4000,
  0,
  4000,
  now() + interval '15 minutes',
  now()
);

insert into public.shop_orders (
  id,
  order_id,
  shop_id,
  status,
  currency,
  subtotal_cents,
  shipping_cents,
  commission_cents,
  total_cents
) values (
  'a3000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'preparing',
  'EUR',
  4000,
  0,
  400,
  4000
);

insert into public.payment_attempts (
  id,
  order_id,
  attempt_number,
  provider_payment_intent_id,
  provider_charge_id,
  idempotency_key,
  status,
  amount_cents,
  currency,
  succeeded_at
) values (
  'a4000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  1,
  'pi_RefundHoldAttempt1',
  'ch_RefundHoldCharge1',
  'payment:refund:hold:attempt:v1',
  'succeeded',
  4000,
  'EUR',
  now()
);

select is(
  public.shop_order_has_active_refund(
    'a3000000-0000-4000-8000-000000000001'
  ),
  false,
  'shop order has no hold before a refund request'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$ select public.request_shop_order_refund(
    'a3000000-0000-4000-8000-000000000001',
    'requested_by_customer',
    'Demande vérifiée qui suspend expédition et reversement.',
    'refund:hold:shop-order:operator:v1'
  ) $$,
  'operator prepares the refund'
);
reset role;

select is(
  public.shop_order_has_active_refund(
    'a3000000-0000-4000-8000-000000000001'
  ),
  true,
  'prepared refund activates the shared hold'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.mark_shop_order_shipped(
    'a3000000-0000-4000-8000-000000000001',
    'Colissimo',
    'HOLD-TRACK-001'
  ) $$,
  '55000',
  'payment_refund_hold_active',
  'seller cannot ship while a refund is active'
);
select is(
  (select count(*)::bigint from public.payment_refunds),
  0::bigint,
  'seller cannot read the internal refund ledger'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*)::bigint from public.payment_refunds),
  0::bigint,
  'customer cannot read operator rationale or provider diagnostics'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::bigint from public.payment_refunds),
  1::bigint,
  'operator can read the internal refund ledger'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(
  (select count(*)::bigint from public.payment_refunds),
  0::bigint,
  'unrelated account cannot read the internal refund ledger'
);
reset role;

update public.shop_orders
set status = 'delivered',
    shipping_carrier = 'Colissimo',
    tracking_number = 'HOLD-TRACK-001',
    shipped_at = now(),
    delivered_at = now(),
    updated_at = now()
where id = 'a3000000-0000-4000-8000-000000000001';

update public.orders
set status = 'delivered',
    updated_at = now()
where id = 'a2000000-0000-4000-8000-000000000001';

set local role service_role;
select throws_ok(
  $$ select * from public.prepare_payment_transfer(
    'a3000000-0000-4000-8000-000000000001',
    'transfer:refund:hold:blocked:v1'
  ) $$,
  '55000',
  'payment_refund_hold_active',
  'seller transfer cannot be prepared while a refund is active'
);
reset role;

select is(
  (
    select count(*)::bigint
    from public.payment_transfers
    where shop_order_id = 'a3000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'blocked transfer leaves no financial ledger row'
);

set local role service_role;
select is(
  public.apply_stripe_refund_state(
    (
      select id
      from public.payment_refunds
      where shop_order_id = 'a3000000-0000-4000-8000-000000000001'
    ),
    're_RefundHoldFailed1',
    'failed',
    4000,
    'EUR',
    'provider_declined_refund'
  ),
  'failed',
  'terminal provider failure releases the refund hold'
);
reset role;

select is(
  public.shop_order_has_active_refund(
    'a3000000-0000-4000-8000-000000000001'
  ),
  false,
  'failed refund is no longer an active hold'
);

set local role service_role;
select is(
  (
    select count(*)::bigint
    from public.prepare_payment_transfer(
      'a3000000-0000-4000-8000-000000000001',
      'transfer:refund:hold:released:v1'
    )
  ),
  1::bigint,
  'seller transfer can proceed only after the hold is terminal'
);
reset role;

select is(
  (
    select status::text
    from public.payment_transfers
    where shop_order_id = 'a3000000-0000-4000-8000-000000000001'
  ),
  'pending',
  'released transfer is recorded once as pending'
);

select * from finish();
rollback;
