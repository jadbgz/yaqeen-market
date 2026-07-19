create type public.order_status as enum (
  'pending_payment',
  'paid',
  'processing',
  'partially_shipped',
  'shipped',
  'delivered',
  'cancelled',
  'partially_refunded',
  'refunded'
);

create type public.shop_order_status as enum (
  'pending_payment',
  'paid',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded'
);

create type public.inventory_reservation_status as enum (
  'active',
  'consumed',
  'released',
  'expired'
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  checkout_token uuid not null,
  status public.order_status not null default 'pending_payment',
  currency char(3) not null default 'EUR' check (currency = upper(currency)),
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  shipping_cents bigint not null default 0 check (shipping_cents >= 0),
  total_cents bigint not null default 0 check (total_cents = subtotal_cents + shipping_cents),
  expires_at timestamptz not null,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, checkout_token),
  check (
    (status in ('paid', 'processing', 'partially_shipped', 'shipped', 'delivered', 'partially_refunded', 'refunded'))
    = (paid_at is not null)
  ),
  check ((status = 'cancelled') = (cancelled_at is not null))
);

create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete restrict,
  status public.shop_order_status not null default 'pending_payment',
  currency char(3) not null default 'EUR' check (currency = upper(currency)),
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  shipping_cents bigint not null default 0 check (shipping_cents >= 0),
  commission_cents bigint not null default 0 check (commission_cents >= 0),
  total_cents bigint not null default 0 check (total_cents = subtotal_cents + shipping_cents),
  tracking_number text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, shop_id),
  check (commission_cents <= subtotal_cents),
  check (tracking_number is null or char_length(tracking_number) between 3 and 180),
  check ((status in ('shipped', 'delivered')) = (shipped_at is not null and tracking_number is not null)),
  check ((status = 'delivered') = (delivered_at is not null))
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  shop_order_id uuid not null references public.shop_orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  product_title text not null check (char_length(product_title) between 2 and 180),
  variant_title text not null check (char_length(variant_title) between 2 and 120),
  sku text not null check (char_length(sku) between 3 and 64),
  unit_price_cents integer not null check (unit_price_cents > 0),
  quantity integer not null check (quantity between 1 and 100),
  line_total_cents bigint generated always as (unit_price_cents::bigint * quantity::bigint) stored,
  created_at timestamptz not null default now(),
  unique (shop_order_id, variant_id)
);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 100),
  status public.inventory_reservation_status not null default 'active',
  expires_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, variant_id),
  check ((status in ('released', 'expired')) = (released_at is not null))
);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('order', 'shop_order')),
  entity_id uuid not null,
  actor_id uuid references public.profiles(id),
  from_status text,
  to_status text not null,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);

create index orders_customer_created_idx on public.orders(customer_id, created_at desc);
create index orders_pending_expiry_idx on public.orders(expires_at) where status = 'pending_payment';
create index shop_orders_shop_status_idx on public.shop_orders(shop_id, status, created_at desc);
create index order_items_shop_order_idx on public.order_items(shop_order_id);
create index inventory_reservations_active_expiry_idx
  on public.inventory_reservations(expires_at) where status = 'active';
create index order_events_entity_idx on public.order_events(entity_type, entity_id, created_at);

create or replace function public.can_read_order(target_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders
    where id = target_order_id and customer_id = (select auth.uid())
  ) or public.is_operator();
$$;

create or replace function public.can_read_shop_order(target_shop_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shop_orders so
    join public.orders o on o.id = so.order_id
    where so.id = target_shop_order_id
      and (o.customer_id = (select auth.uid()) or public.is_shop_member(so.shop_id))
  ) or public.is_operator();
$$;

create or replace function public.can_read_order_event(target_entity_type text, target_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case target_entity_type
    when 'order' then public.can_read_order(target_entity_id)
    when 'shop_order' then public.can_read_shop_order(target_entity_id)
    else false
  end;
$$;

revoke all on function public.can_read_order(uuid) from public;
revoke all on function public.can_read_shop_order(uuid) from public;
revoke all on function public.can_read_order_event(text, uuid) from public;
grant execute on function public.can_read_order(uuid) to authenticated;
grant execute on function public.can_read_shop_order(uuid) to authenticated;
grant execute on function public.can_read_order_event(text, uuid) to authenticated;

alter table public.orders enable row level security;
alter table public.shop_orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.order_events enable row level security;

create policy orders_customer_or_operator_read on public.orders
  for select to authenticated using (public.can_read_order(id));
create policy shop_orders_party_read on public.shop_orders
  for select to authenticated using (public.can_read_shop_order(id));
create policy order_items_party_read on public.order_items
  for select to authenticated using (public.can_read_shop_order(shop_order_id));
create policy inventory_reservations_operator_read on public.inventory_reservations
  for select to authenticated using (public.is_operator());
create policy order_events_party_read on public.order_events
  for select to authenticated using (public.can_read_order_event(entity_type, entity_id));

grant select on public.orders, public.shop_orders, public.order_items, public.inventory_reservations, public.order_events to authenticated;

create or replace function public.create_order_reservation(
  requested_items jsonb,
  requested_checkout_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  created_order_id uuid;
  created_shop_order_id uuid;
  requested_variant_id uuid;
  requested_quantity integer;
  target_variant record;
  target_expires_at timestamptz := now() + interval '15 minutes';
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if requested_checkout_token is null then
    raise exception using errcode = '22023', message = 'checkout_token_required';
  end if;

  if jsonb_typeof(requested_items) is distinct from 'array'
    or jsonb_array_length(requested_items) not between 1 and 50 then
    raise exception using errcode = '22023', message = 'invalid_order_items';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(requested_items) as item
    where jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item -> 'variant_id') is distinct from 'string'
      or (item ->> 'variant_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(item -> 'quantity') is distinct from 'number'
      or (item ->> 'quantity') !~ '^[1-9][0-9]{0,2}$'
      or (item ->> 'quantity')::integer > 100
      or item - array['variant_id', 'quantity'] <> '{}'::jsonb
  ) then
    raise exception using errcode = '22023', message = 'invalid_order_item';
  end if;

  if (
    select count(*) <> count(distinct item ->> 'variant_id')
    from jsonb_array_elements(requested_items) as item
  ) then
    raise exception using errcode = '22023', message = 'duplicate_order_variant';
  end if;

  if (
    select sum((item ->> 'quantity')::integer) > 100
    from jsonb_array_elements(requested_items) as item
  ) then
    raise exception using errcode = '22023', message = 'order_quantity_limit_exceeded';
  end if;

  -- Serialize idempotency and the active-reservation quota per customer.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('order-customer:' || current_user_id::text, 0)
  );

  select id into created_order_id
  from public.orders
  where customer_id = current_user_id and checkout_token = requested_checkout_token;

  if found then
    return created_order_id;
  end if;

  if (
    select count(*) >= 3
    from public.orders
    where customer_id = current_user_id
      and status = 'pending_payment'
      and expires_at > now()
  ) then
    raise exception using errcode = '54000', message = 'active_order_limit_reached';
  end if;

  insert into public.orders (customer_id, checkout_token, status, currency, expires_at)
  values (current_user_id, requested_checkout_token, 'pending_payment', 'EUR', target_expires_at)
  returning id into created_order_id;

  for requested_variant_id, requested_quantity in
    select (item ->> 'variant_id')::uuid, (item ->> 'quantity')::integer
    from jsonb_array_elements(requested_items) as item
    order by (item ->> 'variant_id')::uuid
  loop
    select
      v.id as variant_id,
      v.product_id,
      v.title as variant_title,
      v.sku,
      v.price_cents,
      v.currency,
      v.stock_on_hand,
      v.stock_reserved,
      p.title as product_title,
      p.shop_id
    into target_variant
    from public.product_variants v
    join public.products p on p.id = v.product_id
    join public.shops s on s.id = p.shop_id
    where v.id = requested_variant_id
      and v.active
      and v.price_cents > 0
      and v.currency = 'EUR'
      and p.status = 'published'
      and s.status = 'approved'
      and exists (
        select 1 from public.product_evidence e
        where e.product_id = p.id and e.status = 'approved'
      )
    for update of v;

    if not found then
      raise exception using errcode = '22023', message = 'variant_not_orderable';
    end if;

    if target_variant.stock_on_hand - target_variant.stock_reserved < requested_quantity then
      raise exception using errcode = '23514', message = 'insufficient_stock';
    end if;

    insert into public.shop_orders (order_id, shop_id, status, currency)
    values (created_order_id, target_variant.shop_id, 'pending_payment', 'EUR')
    on conflict (order_id, shop_id) do nothing;

    select id into created_shop_order_id
    from public.shop_orders
    where order_id = created_order_id and shop_id = target_variant.shop_id;

    update public.product_variants
    set stock_reserved = stock_reserved + requested_quantity,
        updated_at = now()
    where id = requested_variant_id;

    insert into public.inventory_reservations (order_id, variant_id, quantity, status, expires_at)
    values (created_order_id, requested_variant_id, requested_quantity, 'active', target_expires_at);

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
      created_shop_order_id,
      target_variant.product_id,
      target_variant.variant_id,
      target_variant.product_title,
      target_variant.variant_title,
      target_variant.sku,
      target_variant.price_cents,
      requested_quantity
    );

    update public.shop_orders
    set subtotal_cents = subtotal_cents + target_variant.price_cents::bigint * requested_quantity,
        total_cents = total_cents + target_variant.price_cents::bigint * requested_quantity,
        updated_at = now()
    where id = created_shop_order_id;

    update public.orders
    set subtotal_cents = subtotal_cents + target_variant.price_cents::bigint * requested_quantity,
        total_cents = total_cents + target_variant.price_cents::bigint * requested_quantity,
        updated_at = now()
    where id = created_order_id;
  end loop;

  insert into public.order_events (entity_type, entity_id, actor_id, from_status, to_status, reason)
  values ('order', created_order_id, current_user_id, null, 'pending_payment', 'checkout_reservation_created');

  insert into public.order_events (entity_type, entity_id, actor_id, from_status, to_status, reason)
  select 'shop_order', id, current_user_id, null, 'pending_payment', 'checkout_reservation_created'
  from public.shop_orders
  where order_id = created_order_id;

  return created_order_id;
end;
$$;

create or replace function public.cancel_pending_order(requested_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_status public.order_status;
  target_reservation record;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select status into current_status
  from public.orders
  where id = requested_order_id and customer_id = current_user_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'order_ownership_required';
  end if;

  if current_status <> 'pending_payment' then
    raise exception using errcode = '55000', message = 'order_not_cancellable';
  end if;

  for target_reservation in
    select id, variant_id, quantity
    from public.inventory_reservations
    where order_id = requested_order_id and status = 'active'
    order by variant_id
    for update
  loop
    update public.product_variants
    set stock_reserved = stock_reserved - target_reservation.quantity,
        updated_at = now()
    where id = target_reservation.variant_id
      and stock_reserved >= target_reservation.quantity;

    if not found then
      raise exception using errcode = '23514', message = 'stock_reservation_invariant_failed';
    end if;

    update public.inventory_reservations
    set status = 'released', released_at = now()
    where id = target_reservation.id;
  end loop;

  insert into public.order_events (entity_type, entity_id, actor_id, from_status, to_status, reason)
  select 'shop_order', id, current_user_id, status::text, 'cancelled', 'cancelled_by_customer'
  from public.shop_orders
  where order_id = requested_order_id and status = 'pending_payment';

  update public.shop_orders
  set status = 'cancelled', updated_at = now()
  where order_id = requested_order_id and status = 'pending_payment';

  insert into public.order_events (entity_type, entity_id, actor_id, from_status, to_status, reason)
  values ('order', requested_order_id, current_user_id, current_status::text, 'cancelled', 'cancelled_by_customer');

  update public.orders
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = requested_order_id;
end;
$$;

create or replace function public.expire_pending_orders(requested_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order record;
  target_reservation record;
  expired_count integer := 0;
begin
  if requested_limit is null or requested_limit not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_expiration_limit';
  end if;

  for target_order in
    select id
    from public.orders
    where status = 'pending_payment' and expires_at <= now()
    order by expires_at, id
    limit requested_limit
    for update skip locked
  loop
    for target_reservation in
      select id, variant_id, quantity
      from public.inventory_reservations
      where order_id = target_order.id and status = 'active'
      order by variant_id
      for update
    loop
      update public.product_variants
      set stock_reserved = stock_reserved - target_reservation.quantity,
          updated_at = now()
      where id = target_reservation.variant_id
        and stock_reserved >= target_reservation.quantity;

      if not found then
        raise exception using errcode = '23514', message = 'stock_reservation_invariant_failed';
      end if;

      update public.inventory_reservations
      set status = 'expired', released_at = now()
      where id = target_reservation.id;
    end loop;

    insert into public.order_events (entity_type, entity_id, actor_id, from_status, to_status, reason)
    select 'shop_order', id, null, status::text, 'cancelled', 'payment_window_expired'
    from public.shop_orders
    where order_id = target_order.id and status = 'pending_payment';

    update public.shop_orders
    set status = 'cancelled', updated_at = now()
    where order_id = target_order.id and status = 'pending_payment';

    insert into public.order_events (entity_type, entity_id, actor_id, from_status, to_status, reason)
    values ('order', target_order.id, null, 'pending_payment', 'cancelled', 'payment_window_expired');

    update public.orders
    set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where id = target_order.id;

    expired_count := expired_count + 1;
  end loop;

  return expired_count;
end;
$$;

revoke all on function public.create_order_reservation(jsonb, uuid) from public;
revoke all on function public.cancel_pending_order(uuid) from public;
revoke all on function public.expire_pending_orders(integer) from public;

grant execute on function public.create_order_reservation(jsonb, uuid) to authenticated;
grant execute on function public.cancel_pending_order(uuid) to authenticated;
grant execute on function public.expire_pending_orders(integer) to service_role;
