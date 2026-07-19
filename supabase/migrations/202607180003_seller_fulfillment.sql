alter table public.shop_orders
  add column shipping_carrier text;

-- Keep the migration deployable if a pre-pilot environment already contains
-- shipments created before carrier capture became mandatory.
update public.shop_orders
set shipping_carrier = 'Transporteur historique'
where status in ('shipped', 'delivered') and shipping_carrier is null;

alter table public.shop_orders
  add constraint shop_orders_shipping_carrier_length
    check (shipping_carrier is null or char_length(shipping_carrier) between 2 and 80),
  add constraint shop_orders_shipping_carrier_state
    check ((status in ('shipped', 'delivered')) = (shipping_carrier is not null));

create or replace function public.can_fulfill_shop(target_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.shops
    where id = target_shop_id and owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.shop_members
    where shop_id = target_shop_id
      and user_id = (select auth.uid())
      and member_role in ('owner', 'manager', 'fulfillment')
  );
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
      and (o.customer_id = (select auth.uid()) or public.can_fulfill_shop(so.shop_id))
  ) or public.is_operator();
$$;

drop policy order_shipping_addresses_party_read on public.order_shipping_addresses;
create policy order_shipping_addresses_party_read on public.order_shipping_addresses
  for select to authenticated using (
    public.can_read_order(order_id)
    or exists (
      select 1 from public.shop_orders so
      where so.order_id = order_shipping_addresses.order_id
        and public.can_fulfill_shop(so.shop_id)
    )
  );

create or replace function public.recompute_order_fulfillment_status(
  requested_order_id uuid,
  requested_actor_id uuid
)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders;
  total_shop_orders integer;
  delivered_shop_orders integer;
  shipped_shop_orders integer;
  preparing_shop_orders integer;
  paid_shop_orders integer;
  next_status public.order_status;
begin
  select * into target_order
  from public.orders
  where id = requested_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'order_not_found';
  end if;
  if target_order.status not in ('paid', 'processing', 'partially_shipped', 'shipped', 'delivered') then
    raise exception using errcode = '55000', message = 'order_not_fulfillable';
  end if;

  select
    count(*),
    count(*) filter (where status = 'delivered'),
    count(*) filter (where status in ('shipped', 'delivered')),
    count(*) filter (where status = 'preparing'),
    count(*) filter (where status = 'paid')
  into total_shop_orders, delivered_shop_orders, shipped_shop_orders,
    preparing_shop_orders, paid_shop_orders
  from public.shop_orders
  where order_id = requested_order_id;

  if total_shop_orders = 0 then
    raise exception using errcode = '23514', message = 'shop_orders_required';
  elsif delivered_shop_orders = total_shop_orders then
    next_status := 'delivered';
  elsif shipped_shop_orders = total_shop_orders then
    next_status := 'shipped';
  elsif shipped_shop_orders > 0 then
    next_status := 'partially_shipped';
  elsif preparing_shop_orders > 0 then
    next_status := 'processing';
  elsif paid_shop_orders = total_shop_orders then
    next_status := 'paid';
  else
    raise exception using errcode = '23514', message = 'unsupported_shop_order_mix';
  end if;

  if target_order.status <> next_status then
    insert into public.order_events (
      entity_type, entity_id, actor_id, from_status, to_status, reason
    ) values (
      'order', requested_order_id, requested_actor_id, target_order.status::text,
      next_status::text, 'seller_fulfillment_aggregate_recomputed'
    );
    update public.orders
    set status = next_status, updated_at = now()
    where id = requested_order_id;
  end if;

  return next_status;
end;
$$;

create or replace function public.start_shop_order_preparation(requested_shop_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_shop_order public.shop_orders;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select * into target_shop_order
  from public.shop_orders
  where id = requested_shop_order_id
  for update;

  if not found or not public.can_fulfill_shop(target_shop_order.shop_id) then
    raise exception using errcode = '42501', message = 'shop_order_membership_required';
  end if;
  if target_shop_order.status = 'preparing' then return 'duplicate'; end if;
  if target_shop_order.status <> 'paid' then
    raise exception using errcode = '55000', message = 'shop_order_not_preparable';
  end if;

  insert into public.order_events (
    entity_type, entity_id, actor_id, from_status, to_status, reason
  ) values (
    'shop_order', target_shop_order.id, current_user_id,
    target_shop_order.status::text, 'preparing', 'preparation_started_by_seller'
  );
  update public.shop_orders
  set status = 'preparing', updated_at = now()
  where id = target_shop_order.id;

  perform public.recompute_order_fulfillment_status(target_shop_order.order_id, current_user_id);
  return 'preparing';
end;
$$;

create or replace function public.mark_shop_order_shipped(
  requested_shop_order_id uuid,
  requested_shipping_carrier text,
  requested_tracking_number text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_carrier text := nullif(regexp_replace(trim(requested_shipping_carrier), '\s+', ' ', 'g'), '');
  normalized_tracking text := nullif(regexp_replace(trim(requested_tracking_number), '\s+', '', 'g'), '');
  target_shop_order public.shop_orders;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if normalized_carrier is null or char_length(normalized_carrier) not between 2 and 80
    or normalized_carrier ~ '[<>]' then
    raise exception using errcode = '22023', message = 'invalid_shipping_carrier';
  end if;
  if normalized_tracking is null or char_length(normalized_tracking) not between 3 and 80
    or normalized_tracking !~ '^[A-Za-z0-9._/-]+$' then
    raise exception using errcode = '22023', message = 'invalid_tracking_number';
  end if;

  select * into target_shop_order
  from public.shop_orders
  where id = requested_shop_order_id
  for update;

  if not found or not public.can_fulfill_shop(target_shop_order.shop_id) then
    raise exception using errcode = '42501', message = 'shop_order_membership_required';
  end if;
  if target_shop_order.status = 'shipped' then
    if target_shop_order.shipping_carrier = normalized_carrier
      and target_shop_order.tracking_number = normalized_tracking then
      return 'duplicate';
    end if;
    raise exception using errcode = '55000', message = 'shipment_already_recorded';
  end if;
  if target_shop_order.status <> 'preparing' then
    raise exception using errcode = '55000', message = 'preparation_required_before_shipping';
  end if;

  insert into public.order_events (
    entity_type, entity_id, actor_id, from_status, to_status, reason
  ) values (
    'shop_order', target_shop_order.id, current_user_id,
    target_shop_order.status::text, 'shipped', 'shipment_recorded_by_seller'
  );
  update public.shop_orders
  set status = 'shipped', shipping_carrier = normalized_carrier,
      tracking_number = normalized_tracking, shipped_at = now(), updated_at = now()
  where id = target_shop_order.id;

  perform public.recompute_order_fulfillment_status(target_shop_order.order_id, current_user_id);
  return 'shipped';
end;
$$;

revoke all on function public.recompute_order_fulfillment_status(uuid, uuid) from public;
revoke all on function public.can_fulfill_shop(uuid) from public;
revoke all on function public.start_shop_order_preparation(uuid) from public;
revoke all on function public.mark_shop_order_shipped(uuid, text, text) from public;

grant execute on function public.start_shop_order_preparation(uuid) to authenticated;
grant execute on function public.mark_shop_order_shipped(uuid, text, text) to authenticated;
grant execute on function public.can_fulfill_shop(uuid) to authenticated;

comment on function public.start_shop_order_preparation(uuid) is
  'Seller-only transition from paid to preparing with aggregate order recomputation.';
comment on function public.mark_shop_order_shipped(uuid, text, text) is
  'Seller-only shipment transition requiring normalized carrier and tracking data.';
