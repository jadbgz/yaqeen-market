begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(65);

select has_type('public', 'order_status', 'order status enum exists');
select has_type('public', 'shop_order_status', 'shop order status enum exists');
select has_type('public', 'inventory_reservation_status', 'inventory reservation status enum exists');
select has_table('public', 'orders', 'orders table exists');
select has_table('public', 'shop_orders', 'shop orders table exists');
select has_table('public', 'order_items', 'order items table exists');
select has_table('public', 'inventory_reservations', 'inventory reservations table exists');
select has_table('public', 'order_events', 'order events table exists');

select results_eq(
  $$
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('orders', 'shop_orders', 'order_items', 'inventory_reservations', 'order_events')
      and c.relrowsecurity
  $$,
  $$ values (5::bigint) $$,
  'RLS is enabled on every order domain table'
);

select policies_are('public', 'orders', array['orders_customer_or_operator_read']);
select policies_are('public', 'shop_orders', array['shop_orders_party_read']);
select policies_are('public', 'order_items', array['order_items_party_read']);
select policies_are('public', 'inventory_reservations', array['inventory_reservations_operator_read']);
select policies_are('public', 'order_events', array['order_events_party_read']);

select has_index('public', 'orders', 'orders_customer_created_idx', 'customer order history has an index');
select has_index('public', 'shop_orders', 'shop_orders_shop_status_idx', 'seller fulfillment queue has an index');
select has_index('public', 'inventory_reservations', 'inventory_reservations_active_expiry_idx', 'active reservation expiry has an index');

select results_eq(
  $$ select has_table_privilege('authenticated', 'public.orders', 'INSERT') $$,
  $$ values (false) $$,
  'authenticated clients cannot insert orders directly'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.orders', 'UPDATE') $$,
  $$ values (false) $$,
  'authenticated clients cannot update order status directly'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.shop_orders', 'INSERT') $$,
  $$ values (false) $$,
  'authenticated clients cannot insert seller sub-orders directly'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.shop_orders', 'UPDATE') $$,
  $$ values (false) $$,
  'authenticated clients cannot forge fulfillment transitions'
);

select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_order_reservation' and p.prosecdef $$,
  $$ values (1::bigint) $$,
  'order reservation is a security-definer boundary'
);
select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cancel_pending_order' and p.prosecdef $$,
  $$ values (1::bigint) $$,
  'customer cancellation is a security-definer boundary'
);
select results_eq(
  $$ select count(*)::bigint from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'expire_pending_orders' and p.prosecdef $$,
  $$ values (1::bigint) $$,
  'expiration worker is a security-definer boundary'
);
select results_eq(
  $$ select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_order_reservation' $$,
  $$ values (false) $$,
  'anonymous visitors cannot reserve stock'
);
select results_eq(
  $$ select has_function_privilege('authenticated', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_order_reservation' $$,
  $$ values (true) $$,
  'authenticated customers can reach the guarded reservation RPC'
);
select results_eq(
  $$ select has_function_privilege('authenticated', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'expire_pending_orders' $$,
  $$ values (false) $$,
  'authenticated clients cannot invoke the expiration worker'
);
select results_eq(
  $$ select has_function_privilege('service_role', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'expire_pending_orders' $$,
  $$ values (true) $$,
  'the service role can invoke the expiration worker'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('20000000-0000-0000-0000-000000000001', 'order-seller@yaqeen.local', '{"display_name":"Order Seller"}'),
  ('20000000-0000-0000-0000-000000000002', 'order-customer@yaqeen.local', '{"display_name":"Order Customer"}'),
  ('20000000-0000-0000-0000-000000000003', 'order-outsider@yaqeen.local', '{"display_name":"Order Outsider"}'),
  ('20000000-0000-0000-0000-000000000004', 'order-operator@yaqeen.local', '{"display_name":"Order Operator"}'),
  ('20000000-0000-0000-0000-000000000005', 'order-seller-two@yaqeen.local', '{"display_name":"Order Seller Two"}');

update public.profiles set role = 'seller' where id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000005'
);
update public.profiles set role = 'operator' where id = '20000000-0000-0000-0000-000000000004';

insert into public.shops (id, owner_id, slug, name, description, status, ships_from_country)
values
  (
    '21000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'order-shop',
    'Order Shop',
    'Boutique approuvée pour les tests de commande.',
    'approved',
    'FR'
  ),
  (
    '21000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000005',
    'order-shop-two',
    'Order Shop Two',
    'Deuxième boutique approuvée pour valider la ventilation.',
    'approved',
    'FR'
  );
insert into public.shop_members (shop_id, user_id, member_role)
values
  ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'owner'),
  ('21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000005', 'owner');

insert into public.products (id, shop_id, slug, title, description, category, status, published_at)
values
  (
    '22000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'orderable-product',
    'Produit commandable',
    'Produit approuvé utilisé pour valider les réservations de stock.',
    'parfums',
    'published',
    now()
  ),
  (
    '22000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000001',
    'draft-product',
    'Produit brouillon',
    'Produit non publié qui ne doit jamais pouvoir être commandé.',
    'parfums',
    'draft',
    null
  ),
  (
    '22000000-0000-0000-0000-000000000003',
    '21000000-0000-0000-0000-000000000002',
    'second-shop-product',
    'Produit seconde boutique',
    'Produit publié par la seconde boutique du scénario multi-vendeur.',
    'livres',
    'published',
    now()
  );

insert into public.product_variants (id, product_id, sku, title, price_cents, currency, stock_on_hand, stock_reserved, active)
values
  ('23000000-0000-4000-8000-000000000001', '22000000-0000-0000-0000-000000000001', 'ORDERABLE-01', 'Format test', 3490, 'EUR', 5, 0, true),
  ('23000000-0000-4000-8000-000000000002', '22000000-0000-0000-0000-000000000002', 'DRAFT-01', 'Format brouillon', 1990, 'EUR', 5, 0, true),
  ('23000000-0000-4000-8000-000000000003', '22000000-0000-0000-0000-000000000003', 'SECOND-01', 'Édition test', 2500, 'EUR', 3, 0, true);

insert into public.product_evidence (
  product_id, kind, status, scope, public_summary, submitted_by, reviewed_by, reviewed_at
) values
  (
    '22000000-0000-0000-0000-000000000001',
    'seller_declaration',
    'approved',
    'Déclaration couvrant la composition du produit de test.',
    'Preuve approuvée pour le scénario de commande automatisé.',
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000004',
    now()
  ),
  (
    '22000000-0000-0000-0000-000000000003',
    'documentary_review',
    'approved',
    'Revue documentaire du produit de la seconde boutique.',
    'Preuve approuvée pour tester une commande multi-vendeur.',
    '20000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000004',
    now()
  );

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok(
  $$ select public.create_order_reservation(
    '[{"variant_id":"23000000-0000-4000-8000-000000000001","quantity":2},{"variant_id":"23000000-0000-4000-8000-000000000003","quantity":1}]'::jsonb,
    '24000000-0000-4000-8000-000000000001'
  ) $$,
  'a customer can atomically create an order and reserve available stock'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from public.orders where checkout_token = '24000000-0000-4000-8000-000000000001' $$,
  $$ values (1::bigint) $$,
  'reservation creates exactly one customer order'
);
select results_eq(
  $$ select status::text, subtotal_cents, shipping_cents, total_cents, currency::text
     from public.orders where checkout_token = '24000000-0000-4000-8000-000000000001' $$,
  $$ values ('pending_payment'::text, 9480::bigint, 0::bigint, 9480::bigint, 'EUR'::text) $$,
  'order totals and pending-payment state are derived server-side'
);
select results_eq(
  $$ select count(*)::bigint from public.shop_orders so join public.orders o on o.id = so.order_id
     where o.checkout_token = '24000000-0000-4000-8000-000000000001' $$,
  $$ values (2::bigint) $$,
  'items are split into one sub-order per seller'
);
select results_eq(
  $$ select oi.product_title, oi.variant_title, oi.sku, oi.unit_price_cents, oi.quantity, oi.line_total_cents
     from public.order_items oi join public.shop_orders so on so.id = oi.shop_order_id
     join public.orders o on o.id = so.order_id
     where o.checkout_token = '24000000-0000-4000-8000-000000000001'
       and oi.variant_id = '23000000-0000-4000-8000-000000000001' $$,
  $$ values ('Produit commandable'::text, 'Format test'::text, 'ORDERABLE-01'::text, 3490, 2, 6980::bigint) $$,
  'the immutable item snapshot preserves product, variant, SKU, price and quantity'
);
select results_eq(
  $$ select stock_reserved from public.product_variants where id = '23000000-0000-4000-8000-000000000001' $$,
  $$ values (2) $$,
  'physical stock is reserved atomically'
);
select results_eq(
  $$ select stock_reserved from public.product_variants where id = '23000000-0000-4000-8000-000000000003' $$,
  $$ values (1) $$,
  'stock is reserved independently for the second seller'
);
select results_eq(
  $$ select status::text, quantity from public.inventory_reservations r join public.orders o on o.id = r.order_id
     where o.checkout_token = '24000000-0000-4000-8000-000000000001'
       and r.variant_id = '23000000-0000-4000-8000-000000000001' $$,
  $$ values ('active'::text, 2) $$,
  'an active reservation records the exact quantity'
);
select results_eq(
  $$ select count(*)::bigint from public.order_events e join public.orders o on o.id = e.entity_id
     where e.entity_type = 'order' and o.checkout_token = '24000000-0000-4000-8000-000000000001' $$,
  $$ values (1::bigint) $$,
  'order creation leaves an audit event'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}';
select results_eq(
  $$ select public.create_order_reservation(
    '[{"variant_id":"23000000-0000-4000-8000-000000000001","quantity":2},{"variant_id":"23000000-0000-4000-8000-000000000003","quantity":1}]'::jsonb,
    '24000000-0000-4000-8000-000000000001'
  ) $$,
  $$ select id from public.orders where checkout_token = '24000000-0000-4000-8000-000000000001' $$,
  'replaying the checkout token returns the original order'
);
reset role;
select results_eq(
  $$ select stock_reserved from public.product_variants where id = '23000000-0000-4000-8000-000000000001' $$,
  $$ values (2) $$,
  'an idempotent replay does not reserve stock twice'
);
select results_eq(
  $$ select stock_reserved from public.product_variants where id = '23000000-0000-4000-8000-000000000003' $$,
  $$ values (1) $$,
  'an idempotent replay does not duplicate the second seller reservation'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.orders $$,
  $$ values (1::bigint) $$,
  'the customer can read their own aggregate order'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"20000000-0000-0000-0000-000000000005","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.shop_orders $$,
  $$ values (1::bigint) $$,
  'the second seller sees exactly their own sub-order'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.orders $$,
  $$ values (0::bigint) $$,
  'another customer cannot read the order aggregate'
);
select results_eq(
  $$ select count(*)::bigint from public.order_items $$,
  $$ values (0::bigint) $$,
  'another customer cannot read order item snapshots'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.shop_orders $$,
  $$ values (1::bigint) $$,
  'the seller can read only their fulfillment sub-order'
);
select results_eq(
  $$ select count(*)::bigint from public.orders $$,
  $$ values (0::bigint) $$,
  'the seller cannot read the customer aggregate order'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ insert into public.orders (customer_id, checkout_token, expires_at)
     values ('20000000-0000-0000-0000-000000000002', gen_random_uuid(), now() + interval '15 minutes') $$,
  '42501', 'permission denied for table orders',
  'a customer cannot forge an order with a direct insert'
);
select throws_ok(
  $$ select public.create_order_reservation(
    '[{"variant_id":"23000000-0000-4000-8000-000000000001","quantity":4}]'::jsonb,
    '24000000-0000-4000-8000-000000000002'
  ) $$,
  '23514', 'insufficient_stock',
  'a concurrent order cannot reserve more than available stock'
);
select throws_ok(
  $$ select public.create_order_reservation(
    '[{"variant_id":"23000000-0000-4000-8000-000000000002","quantity":1}]'::jsonb,
    '24000000-0000-4000-8000-000000000003'
  ) $$,
  '22023', 'variant_not_orderable',
  'a draft product cannot enter an order'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ select public.cancel_pending_order(
    (select id from public.orders where checkout_token = '24000000-0000-4000-8000-000000000001')
  ) $$,
  '42501', 'order_ownership_required',
  'another customer cannot cancel the order'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ update public.shop_orders set status = 'shipped' $$,
  '42501', 'permission denied for table shop_orders',
  'a seller cannot forge a shipped state directly'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok(
  $$ select public.cancel_pending_order(
    (select id from public.orders where checkout_token = '24000000-0000-4000-8000-000000000001')
  ) $$,
  'the owning customer can cancel a pending-payment order'
);
reset role;

select results_eq(
  $$ select status::text, cancelled_at is not null from public.orders
     where checkout_token = '24000000-0000-4000-8000-000000000001' $$,
  $$ values ('cancelled'::text, true) $$,
  'cancellation records the aggregate state and timestamp'
);
select results_eq(
  $$ select count(*)::bigint from public.shop_orders so join public.orders o on o.id = so.order_id
     where o.checkout_token = '24000000-0000-4000-8000-000000000001' and so.status = 'cancelled' $$,
  $$ values (2::bigint) $$,
  'cancellation closes every seller sub-order'
);
select results_eq(
  $$ select stock_reserved from public.product_variants where id = '23000000-0000-4000-8000-000000000001' $$,
  $$ values (0) $$,
  'cancellation releases the physical stock reservation'
);
select results_eq(
  $$ select stock_reserved from public.product_variants where id = '23000000-0000-4000-8000-000000000003' $$,
  $$ values (0) $$,
  'cancellation releases stock belonging to the second seller'
);
select results_eq(
  $$ select status::text, released_at is not null from public.inventory_reservations r join public.orders o on o.id = r.order_id
     where o.checkout_token = '24000000-0000-4000-8000-000000000001' $$,
  $$ values ('released'::text, true) $$,
  'cancellation marks the reservation as released'
);
select results_eq(
  $$ select count(*)::bigint from public.order_events e join public.orders o on o.id = e.entity_id
     where e.entity_type = 'order' and o.checkout_token = '24000000-0000-4000-8000-000000000001'
       and e.to_status = 'cancelled' and e.reason = 'cancelled_by_customer' $$,
  $$ values (1::bigint) $$,
  'customer cancellation leaves an attributed audit event'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.cancel_pending_order(
    (select id from public.orders where checkout_token = '24000000-0000-4000-8000-000000000001')
  ) $$,
  '55000', 'order_not_cancellable',
  'a cancelled order cannot be cancelled twice'
);
select lives_ok(
  $$ select public.create_order_reservation(
    '[{"variant_id":"23000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
    '24000000-0000-4000-8000-000000000004'
  ) $$,
  'a new reservation can be created after the previous one releases stock'
);
reset role;

update public.orders
set expires_at = now() - interval '1 minute'
where checkout_token = '24000000-0000-4000-8000-000000000004';
update public.inventory_reservations
set expires_at = now() - interval '1 minute'
where order_id = (select id from public.orders where checkout_token = '24000000-0000-4000-8000-000000000004');

set local role service_role;
select results_eq(
  $$ select public.expire_pending_orders(100) $$,
  $$ values (1) $$,
  'the trusted worker expires one overdue order'
);
reset role;

select results_eq(
  $$ select status::text, cancelled_at is not null from public.orders
     where checkout_token = '24000000-0000-4000-8000-000000000004' $$,
  $$ values ('cancelled'::text, true) $$,
  'expiration closes the overdue aggregate order'
);
select results_eq(
  $$ select status::text, released_at is not null from public.inventory_reservations r join public.orders o on o.id = r.order_id
     where o.checkout_token = '24000000-0000-4000-8000-000000000004' $$,
  $$ values ('expired'::text, true) $$,
  'expiration marks the reservation and its release time'
);
select results_eq(
  $$ select stock_reserved from public.product_variants where id = '23000000-0000-4000-8000-000000000001' $$,
  $$ values (0) $$,
  'expiration restores all reserved stock'
);
select results_eq(
  $$ select count(*)::bigint from public.order_events e join public.orders o on o.id = e.entity_id
     where e.entity_type = 'order' and o.checkout_token = '24000000-0000-4000-8000-000000000004'
       and e.to_status = 'cancelled' and e.reason = 'payment_window_expired' and e.actor_id is null $$,
  $$ values (1::bigint) $$,
  'system expiration leaves an unattributed audit event'
);

select * from finish();
rollback;
