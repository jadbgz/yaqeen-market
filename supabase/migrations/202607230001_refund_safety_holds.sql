-- A refund request is a financial hold. From the moment it is prepared until it
-- reaches a terminal failed/cancelled state, sellers must not move the parcel
-- forward and the platform must not release seller funds.

create or replace function public.shop_order_has_active_refund(
  requested_shop_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payment_refunds pr
    where pr.shop_order_id = requested_shop_order_id
      and pr.status in ('prepared', 'submitted', 'pending')
  );
$$;

revoke all on function public.shop_order_has_active_refund(uuid) from public;

create or replace function public.start_shop_order_preparation(
  requested_shop_order_id uuid
)
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
  if public.shop_order_has_active_refund(target_shop_order.id) then
    raise exception using errcode = '55000', message = 'payment_refund_hold_active';
  end if;
  if target_shop_order.status = 'preparing' then
    return 'duplicate';
  end if;
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

  perform public.recompute_order_fulfillment_status(
    target_shop_order.order_id,
    current_user_id
  );
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
  normalized_carrier text := nullif(
    regexp_replace(trim(requested_shipping_carrier), '\s+', ' ', 'g'),
    ''
  );
  normalized_tracking text := nullif(
    regexp_replace(trim(requested_tracking_number), '\s+', '', 'g'),
    ''
  );
  target_shop_order public.shop_orders;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if normalized_carrier is null
    or char_length(normalized_carrier) not between 2 and 80
    or normalized_carrier ~ '[<>]' then
    raise exception using errcode = '22023', message = 'invalid_shipping_carrier';
  end if;
  if normalized_tracking is null
    or char_length(normalized_tracking) not between 3 and 80
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
  if public.shop_order_has_active_refund(target_shop_order.id) then
    raise exception using errcode = '55000', message = 'payment_refund_hold_active';
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
  set status = 'shipped',
      shipping_carrier = normalized_carrier,
      tracking_number = normalized_tracking,
      shipped_at = now(),
      updated_at = now()
  where id = target_shop_order.id;

  perform public.recompute_order_fulfillment_status(
    target_shop_order.order_id,
    current_user_id
  );
  return 'shipped';
end;
$$;

-- Refund rows include operator rationale, provider identifiers and failure
-- diagnostics. Parties receive public order status elsewhere; this internal
-- ledger is visible only to operators.
drop policy if exists payment_refunds_party_read on public.payment_refunds;
create policy payment_refunds_operator_read on public.payment_refunds
  for select
  to authenticated
  using (public.is_operator());

create or replace function public.prepare_payment_transfer(
  requested_shop_order_id uuid,
  requested_idempotency_key text
)
returns table (
  payment_transfer_id uuid,
  provider_account_id text,
  provider_charge_id text,
  transfer_amount_cents bigint,
  transfer_currency text,
  transfer_idempotency_key text,
  aggregate_order_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_key text := nullif(trim(requested_idempotency_key), '');
  existing_transfer public.payment_transfers;
  target record;
  created_transfer_id uuid;
begin
  if normalized_key is null
    or char_length(normalized_key) not between 20 and 200
    or normalized_key !~ '^[A-Za-z0-9:_-]+$' then
    raise exception using errcode = '22023', message = 'invalid_transfer_idempotency_key';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'payment-transfer:' || requested_shop_order_id::text,
      0
    )
  );

  if public.shop_order_has_active_refund(requested_shop_order_id) then
    raise exception using errcode = '55000', message = 'payment_refund_hold_active';
  end if;

  select * into existing_transfer
  from public.payment_transfers
  where shop_order_id = requested_shop_order_id;

  if found then
    if existing_transfer.idempotency_key <> normalized_key then
      raise exception using errcode = '23505', message = 'transfer_idempotency_conflict';
    end if;
    if public.payment_attempt_has_transfer_hold(existing_transfer.payment_attempt_id) then
      raise exception using errcode = '55000', message = 'payment_dispute_hold_active';
    end if;
    if not exists (
      select 1
      from public.shop_payment_accounts a
      where a.shop_id = existing_transfer.shop_id
        and a.status = 'enabled'
        and a.transfers_enabled
        and a.provider_account_id is not null
    ) then
      raise exception using errcode = '55000', message = 'seller_transfer_account_required';
    end if;
    return query
      select
        pt.id,
        spa.provider_account_id,
        pa.provider_charge_id,
        pt.transfer_cents,
        pt.currency::text,
        pt.idempotency_key,
        so.order_id
      from public.payment_transfers pt
      join public.payment_attempts pa on pa.id = pt.payment_attempt_id
      join public.shop_payment_accounts spa on spa.shop_id = pt.shop_id
      join public.shop_orders so on so.id = pt.shop_order_id
      where pt.id = existing_transfer.id;
    return;
  end if;

  select
    so.id as shop_order_id,
    so.order_id,
    so.shop_id,
    so.status,
    so.total_cents,
    so.commission_cents,
    so.currency,
    pa.id as payment_attempt_id,
    pa.provider_charge_id,
    spa.provider_account_id
  into target
  from public.shop_orders so
  join public.payment_attempts pa
    on pa.order_id = so.order_id
   and pa.status = 'succeeded'
  join public.shop_payment_accounts spa on spa.shop_id = so.shop_id
  where so.id = requested_shop_order_id
  for update of so, pa, spa;

  if not found then
    raise exception using errcode = 'P0002', message = 'transfer_source_not_found';
  end if;
  if target.status <> 'delivered' then
    raise exception using errcode = '55000', message = 'delivered_shop_order_required';
  end if;
  if target.provider_charge_id is null then
    raise exception using errcode = '55000', message = 'succeeded_charge_required';
  end if;
  if public.payment_attempt_has_transfer_hold(target.payment_attempt_id) then
    raise exception using errcode = '55000', message = 'payment_dispute_hold_active';
  end if;
  if target.provider_account_id is null
    or not exists (
      select 1
      from public.shop_payment_accounts
      where shop_id = target.shop_id
        and status = 'enabled'
        and transfers_enabled
    ) then
    raise exception using errcode = '55000', message = 'seller_transfer_account_required';
  end if;
  if target.total_cents - target.commission_cents <= 0 then
    raise exception using errcode = '23514', message = 'positive_transfer_required';
  end if;

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
    target.payment_attempt_id,
    target.shop_order_id,
    target.shop_id,
    normalized_key,
    'pending',
    target.total_cents,
    target.commission_cents,
    target.total_cents - target.commission_cents,
    target.currency
  )
  returning id into created_transfer_id;

  return query
    select
      pt.id,
      target.provider_account_id,
      target.provider_charge_id,
      pt.transfer_cents,
      pt.currency::text,
      pt.idempotency_key,
      target.order_id
    from public.payment_transfers pt
    where pt.id = created_transfer_id;
end;
$$;

revoke all on function public.shop_order_has_active_refund(uuid) from public;
revoke all on function public.start_shop_order_preparation(uuid) from public;
revoke all on function public.mark_shop_order_shipped(uuid, text, text) from public;
revoke all on function public.prepare_payment_transfer(uuid, text) from public;

grant execute on function public.start_shop_order_preparation(uuid) to authenticated;
grant execute on function public.mark_shop_order_shipped(uuid, text, text) to authenticated;
grant execute on function public.prepare_payment_transfer(uuid, text) to service_role;

comment on function public.shop_order_has_active_refund(uuid) is
  'Internal financial hold shared by fulfillment and seller-transfer boundaries.';
comment on function public.start_shop_order_preparation(uuid) is
  'Seller preparation transition blocked atomically while a refund is active.';
comment on function public.mark_shop_order_shipped(uuid, text, text) is
  'Seller shipment transition blocked atomically while a refund is active.';
comment on function public.prepare_payment_transfer(uuid, text) is
  'Creates a seller transfer only after delivery and while neither refund nor dispute holds are active.';
