begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

select has_schema('private', 'private security schema exists');
select has_table(
  'private',
  'usage_buckets',
  'transactional usage ledger exists outside exposed schemas'
);
select has_function(
  'private',
  'consume_daily_quota',
  array['text', 'uuid', 'bigint', 'bigint'],
  'atomic quota primitive exists'
);
select has_trigger(
  'public',
  'orders',
  'orders_daily_domain_quota',
  'new orders consume a daily customer quota'
);
select has_trigger(
  'public',
  'order_items',
  'order_items_daily_unit_quota',
  'reserved units consume a daily customer quota'
);
select ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated sessions cannot resolve private quota objects'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'private.usage_buckets',
    'SELECT'
  ),
  'authenticated sessions cannot read quota subjects or usage'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.consume_daily_quota(text,uuid,bigint,bigint)',
    'EXECUTE'
  ),
  'authenticated sessions cannot choose their own quota limits'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'b0000000-0000-4000-8000-000000000001',
    'quota-customer@yaqeen.local',
    '{"display_name":"Quota Customer"}'
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'quota-seller@yaqeen.local',
    '{"display_name":"Quota Seller"}'
  );

update public.profiles
set role = 'seller'
where id = 'b0000000-0000-4000-8000-000000000002';

insert into public.orders (
  id,
  customer_id,
  checkout_token,
  status,
  currency,
  expires_at
) values (
  'b1000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'b1100000-0000-4000-8000-000000000001',
  'pending_payment',
  'EUR',
  now() + interval '15 minutes'
);

select lives_ok(
  $$
    insert into public.orders (
      customer_id,
      checkout_token,
      status,
      currency,
      expires_at
    )
    select
      'b0000000-0000-4000-8000-000000000001'::uuid,
      gen_random_uuid(),
      'pending_payment',
      'EUR',
      now() + interval '15 minutes'
    from generate_series(1, 19)
  $$,
  'customer can create up to twenty orders in one UTC day'
);

select is(
  (
    select units
    from private.usage_buckets
    where policy = 'customer_orders_created'
  ),
  20::bigint,
  'order quota is accumulated atomically'
);

select throws_ok(
  $$
    insert into public.orders (
      customer_id,
      checkout_token,
      status,
      currency,
      expires_at
    ) values (
      'b0000000-0000-4000-8000-000000000001',
      gen_random_uuid(),
      'pending_payment',
      'EUR',
      now() + interval '15 minutes'
    )
  $$,
  '54000',
  'domain_quota_exceeded',
  'twenty-first order is rejected even below the HTTP layer'
);

select is(
  (
    select count(*)::bigint
    from public.orders
    where customer_id = 'b0000000-0000-4000-8000-000000000001'
  ),
  20::bigint,
  'rejected order leaves no partial domain row'
);

insert into public.shops (
  id,
  owner_id,
  slug,
  name,
  description,
  status,
  ships_from_country
) values (
  'b2000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  'quota-shop',
  'Quota Shop',
  'Boutique de validation des quotas métier.',
  'approved',
  'FR'
);

insert into public.products (
  id,
  shop_id,
  slug,
  title,
  description,
  category,
  status
) values (
  'b3000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'quota-product',
  'Quota Product',
  'Produit de validation des unités quotidiennes.',
  'tests',
  'draft'
);

insert into public.product_variants (
  id,
  product_id,
  sku,
  title,
  price_cents,
  currency,
  stock_on_hand
) values
  (
    'b4000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'QUOTA-001',
    'Variant 1',
    1000,
    'EUR',
    1000
  ),
  (
    'b4000000-0000-4000-8000-000000000002',
    'b3000000-0000-4000-8000-000000000001',
    'QUOTA-002',
    'Variant 2',
    1000,
    'EUR',
    1000
  ),
  (
    'b4000000-0000-4000-8000-000000000003',
    'b3000000-0000-4000-8000-000000000001',
    'QUOTA-003',
    'Variant 3',
    1000,
    'EUR',
    1000
  );

insert into public.shop_orders (
  id,
  order_id,
  shop_id,
  status,
  currency
) values (
  'b5000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'pending_payment',
  'EUR'
);

select lives_ok(
  $$
    insert into public.order_items (
      shop_order_id,
      product_id,
      variant_id,
      product_title,
      variant_title,
      sku,
      unit_price_cents,
      quantity
    ) values
      (
        'b5000000-0000-4000-8000-000000000001',
        'b3000000-0000-4000-8000-000000000001',
        'b4000000-0000-4000-8000-000000000001',
        'Quota Product',
        'Variant 1',
        'QUOTA-001',
        1000,
        100
      ),
      (
        'b5000000-0000-4000-8000-000000000001',
        'b3000000-0000-4000-8000-000000000001',
        'b4000000-0000-4000-8000-000000000002',
        'Quota Product',
        'Variant 2',
        'QUOTA-002',
        1000,
        100
      )
  $$,
  'customer can reserve up to two hundred units in one UTC day'
);

select is(
  (
    select units
    from private.usage_buckets
    where policy = 'customer_units_reserved'
  ),
  200::bigint,
  'reserved-unit quota is accumulated across order lines'
);

select throws_ok(
  $$
    insert into public.order_items (
      shop_order_id,
      product_id,
      variant_id,
      product_title,
      variant_title,
      sku,
      unit_price_cents,
      quantity
    ) values (
      'b5000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      'b4000000-0000-4000-8000-000000000003',
      'Quota Product',
      'Variant 3',
      'QUOTA-003',
      1000,
      1
    )
  $$,
  '54000',
  'domain_quota_exceeded',
  'unit two hundred and one is rejected transactionally'
);

select is(
  (
    select count(*)::bigint
    from public.order_items
    where shop_order_id = 'b5000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'rejected order item leaves no partial line'
);

select is(
  (
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'usage_buckets'
      and column_name in ('user_id', 'customer_id', 'email', 'ip_address')
  ),
  0::bigint,
  'private ledger stores no direct customer or network identifier'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select * from private.usage_buckets $$,
  '42501',
  'permission denied for schema private',
  'authenticated request cannot bypass schema isolation'
);
reset role;

set local role anon;
select throws_ok(
  $$ select private.consume_daily_quota(
    'customer_orders_created',
    'b0000000-0000-4000-8000-000000000001',
    1,
    1000000
  ) $$,
  '42501',
  'permission denied for schema private',
  'anonymous request cannot supply a forged high limit'
);
reset role;

select * from finish();
rollback;
