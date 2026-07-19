begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(42);

select has_column('public', 'shop_orders', 'shipping_carrier', 'shipments retain their carrier');
select has_function('public', 'start_shop_order_preparation', array['uuid'], 'seller preparation boundary exists');
select has_function('public', 'mark_shop_order_shipped', array['uuid','text','text'], 'seller shipment boundary exists');
select has_function('public', 'can_fulfill_shop', array['uuid'], 'fulfillment authorization boundary exists');
select hasnt_function('public', 'mark_shop_order_delivered', array['uuid'], 'sellers cannot self-declare delivery');
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.shop_orders', 'UPDATE') $$,
  $$ values (false) $$,
  'authenticated users cannot bypass fulfillment RPCs'
);
select results_eq(
  $$ select has_function_privilege('anon', 'public.start_shop_order_preparation(uuid)', 'EXECUTE') $$,
  $$ values (false) $$,
  'anonymous users cannot start preparation'
);
select results_eq(
  $$ select has_function_privilege('anon', 'public.mark_shop_order_shipped(uuid,text,text)', 'EXECUTE') $$,
  $$ values (false) $$,
  'anonymous users cannot record shipments'
);
select results_eq(
  $$ select has_function_privilege('authenticated', 'public.start_shop_order_preparation(uuid)', 'EXECUTE') $$,
  $$ values (true) $$,
  'authenticated sellers can reach the preparation boundary'
);
select results_eq(
  $$ select has_function_privilege('authenticated', 'public.mark_shop_order_shipped(uuid,text,text)', 'EXECUTE') $$,
  $$ values (true) $$,
  'authenticated sellers can reach the shipment boundary'
);
select results_eq(
  $$ select has_function_privilege('authenticated', 'public.recompute_order_fulfillment_status(uuid,uuid)', 'EXECUTE') $$,
  $$ values (false) $$,
  'clients cannot call the aggregate recomputation helper'
);
select results_eq(
  $$ select has_function_privilege('authenticated', 'public.can_fulfill_shop(uuid)', 'EXECUTE') $$,
  $$ values (true) $$,
  'RLS can evaluate the scoped fulfillment authority helper'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('50000000-0000-4000-8000-000000000001', 'fulfillment-a@yaqeen.local', '{"display_name":"Seller A"}'),
  ('50000000-0000-4000-8000-000000000002', 'fulfillment-b@yaqeen.local', '{"display_name":"Seller B"}'),
  ('50000000-0000-4000-8000-000000000003', 'fulfillment-customer@yaqeen.local', '{"display_name":"Customer"}'),
  ('50000000-0000-4000-8000-000000000004', 'fulfillment-outsider@yaqeen.local', '{"display_name":"Outsider"}'),
  ('50000000-0000-4000-8000-000000000005', 'catalog-only@yaqeen.local', '{"display_name":"Catalog Only"}');

update public.profiles set role = 'seller'
where id in (
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000005'
);

insert into public.shops (id, owner_id, slug, name, description, status, ships_from_country)
values
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'fulfillment-a', 'Fulfillment A', 'Première boutique du test multi-vendeur.', 'approved', 'FR'),
  ('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'fulfillment-b', 'Fulfillment B', 'Seconde boutique du test multi-vendeur.', 'approved', 'FR');
insert into public.shop_members (shop_id, user_id, member_role)
values
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'owner'),
  ('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'owner'),
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000005', 'catalog');

insert into public.orders (
  id, customer_id, checkout_token, status, currency, subtotal_cents,
  shipping_cents, total_cents, expires_at, paid_at
) values (
  '52000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000003',
  '52100000-0000-4000-8000-000000000001',
  'paid', 'EUR', 3000, 0, 3000, now() + interval '15 minutes', now()
);
insert into public.shop_orders (
  id, order_id, shop_id, status, currency, subtotal_cents,
  shipping_cents, commission_cents, total_cents
) values
  ('53000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'paid', 'EUR', 1000, 0, 0, 1000),
  ('53000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000002', 'paid', 'EUR', 2000, 0, 0, 2000);
insert into public.order_shipping_addresses (
  order_id, source_address_id, recipient_name, line1, postal_code, city, country_code
) values (
  '52000000-0000-4000-8000-000000000001',
  '52200000-0000-4000-8000-000000000001',
  'Client Test', '12 rue Yaqeen', '75001', 'Paris', 'FR'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.shop_orders $$,
  $$ values (1::bigint) $$,
  'seller A reads only their sub-order'
);
select results_eq(
  $$ select count(*)::bigint from public.order_shipping_addresses $$,
  $$ values (1::bigint) $$,
  'seller A can read the address required for fulfillment'
);
select throws_ok(
  $$ update public.shop_orders set status = 'shipped'
     where id = '53000000-0000-4000-8000-000000000001' $$,
  '42501', 'permission denied for table shop_orders',
  'seller A cannot mutate status directly'
);
select throws_ok(
  $$ select public.start_shop_order_preparation('53000000-0000-4000-8000-000000000002') $$,
  '42501', 'shop_order_membership_required',
  'seller A cannot prepare seller B order'
);
select throws_ok(
  $$ select public.mark_shop_order_shipped(
    '53000000-0000-4000-8000-000000000001', 'Colissimo', 'TRACK-A-001'
  ) $$,
  '55000', 'preparation_required_before_shipping',
  'shipping is impossible before preparation'
);
select throws_ok(
  $$ select public.mark_shop_order_shipped(
    '53000000-0000-4000-8000-000000000001', '<script>', 'TRACK-A-001'
  ) $$,
  '22023', 'invalid_shipping_carrier',
  'unsafe carrier input is rejected'
);
select throws_ok(
  $$ select public.mark_shop_order_shipped(
    '53000000-0000-4000-8000-000000000001', 'Colissimo', 'bad tracking!'
  ) $$,
  '22023', 'invalid_tracking_number',
  'malformed tracking input is rejected'
);
select results_eq(
  $$ select public.start_shop_order_preparation('53000000-0000-4000-8000-000000000001') $$,
  $$ values ('preparing'::text) $$,
  'seller A starts preparation'
);
select results_eq(
  $$ select status::text from public.shop_orders where id = '53000000-0000-4000-8000-000000000001' $$,
  $$ values ('preparing'::text) $$,
  'seller A sub-order is preparing'
);
reset role;
select results_eq(
  $$ select status::text from public.orders where id = '52000000-0000-4000-8000-000000000001' $$,
  $$ values ('processing'::text) $$,
  'aggregate order becomes processing'
);
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}';
select results_eq(
  $$ select public.start_shop_order_preparation('53000000-0000-4000-8000-000000000001') $$,
  $$ values ('duplicate'::text) $$,
  'preparation replay is idempotent'
);
select results_eq(
  $$ select count(*)::bigint from public.order_events
     where entity_type = 'shop_order' and entity_id = '53000000-0000-4000-8000-000000000001'
       and to_status = 'preparing' $$,
  $$ values (1::bigint) $$,
  'preparation replay does not duplicate audit history'
);
select results_eq(
  $$ select public.mark_shop_order_shipped(
    '53000000-0000-4000-8000-000000000001', '  La Poste  ', ' TRACK-A-001 '
  ) $$,
  $$ values ('shipped'::text) $$,
  'seller A records a normalized shipment'
);
select results_eq(
  $$ select status::text, shipping_carrier, tracking_number, shipped_at is not null
     from public.shop_orders where id = '53000000-0000-4000-8000-000000000001' $$,
  $$ values ('shipped'::text, 'La Poste'::text, 'TRACK-A-001'::text, true) $$,
  'shipment fields and timestamp are persisted together'
);
reset role;
select results_eq(
  $$ select status::text from public.orders where id = '52000000-0000-4000-8000-000000000001' $$,
  $$ values ('partially_shipped'::text) $$,
  'one shipment in a multi-seller basket yields partial shipment'
);
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}';
select results_eq(
  $$ select public.mark_shop_order_shipped(
    '53000000-0000-4000-8000-000000000001', 'La Poste', 'TRACK-A-001'
  ) $$,
  $$ values ('duplicate'::text) $$,
  'shipment replay is idempotent'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000005","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.shop_orders $$,
  $$ values (0::bigint) $$,
  'catalog-only staff cannot read customer orders'
);
select results_eq(
  $$ select count(*)::bigint from public.order_shipping_addresses $$,
  $$ values (0::bigint) $$,
  'catalog-only staff cannot read customer addresses'
);
select throws_ok(
  $$ select public.start_shop_order_preparation('53000000-0000-4000-8000-000000000001') $$,
  '42501', 'shop_order_membership_required',
  'catalog-only staff cannot invoke fulfillment'
);
select results_eq(
  $$ select public.can_fulfill_shop('51000000-0000-4000-8000-000000000001') $$,
  $$ values (false) $$,
  'catalog membership is not fulfillment authority'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ select public.start_shop_order_preparation('53000000-0000-4000-8000-000000000001') $$,
  '42501', 'shop_order_membership_required',
  'customer cannot invoke seller fulfillment'
);
select results_eq(
  $$ select status::text from public.orders where id = '52000000-0000-4000-8000-000000000001' $$,
  $$ values ('partially_shipped'::text) $$,
  'customer sees the aggregate partial shipment state'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000004","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.shop_orders $$,
  $$ values (0::bigint) $$,
  'outsider cannot read seller orders'
);
select results_eq(
  $$ select count(*)::bigint from public.order_shipping_addresses $$,
  $$ values (0::bigint) $$,
  'outsider cannot read delivery addresses'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.shop_orders $$,
  $$ values (1::bigint) $$,
  'seller B reads only their sub-order'
);
select results_eq(
  $$ select public.start_shop_order_preparation('53000000-0000-4000-8000-000000000002') $$,
  $$ values ('preparing'::text) $$,
  'seller B starts their own preparation'
);
select results_eq(
  $$ select public.mark_shop_order_shipped(
    '53000000-0000-4000-8000-000000000002', 'Chronopost', 'TRACK-B-002'
  ) $$,
  $$ values ('shipped'::text) $$,
  'seller B ships their own sub-order'
);
reset role;

select results_eq(
  $$ select status::text from public.orders where id = '52000000-0000-4000-8000-000000000001' $$,
  $$ values ('shipped'::text) $$,
  'aggregate order is shipped only after every seller ships'
);
select results_eq(
  $$ select count(*)::bigint from public.order_events
     where entity_type = 'order' and entity_id = '52000000-0000-4000-8000-000000000001' $$,
  $$ values (3::bigint) $$,
  'aggregate status changes are each audited once'
);
select results_eq(
  $$ select count(*)::bigint from public.order_events
     where entity_type = 'shop_order' and actor_id is not null $$,
  $$ values (4::bigint) $$,
  'every seller transition retains its actor'
);

select * from finish();
rollback;
