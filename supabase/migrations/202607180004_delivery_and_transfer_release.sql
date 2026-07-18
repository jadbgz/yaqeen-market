create table public.delivery_confirmations (
  id uuid primary key default gen_random_uuid(),
  shop_order_id uuid not null unique references public.shop_orders(id) on delete restrict,
  confirmed_by uuid not null references public.profiles(id) on delete restrict,
  confirmation_source text not null default 'manual_operator'
    check (confirmation_source = 'manual_operator'),
  rationale text not null check (char_length(rationale) between 10 and 1000),
  confirmed_at timestamptz not null default now()
);

alter table public.delivery_confirmations enable row level security;
create policy delivery_confirmations_operator_read on public.delivery_confirmations
  for select to authenticated using (public.is_operator());
grant select on public.delivery_confirmations to authenticated, service_role;

alter table public.payment_transfers
  add column last_error_code text,
  add constraint payment_transfers_last_error_code_length
    check (last_error_code is null or char_length(last_error_code) between 2 and 120);

create or replace function public.confirm_shop_order_delivery(
  requested_shop_order_id uuid,
  requested_rationale text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_rationale text := nullif(regexp_replace(trim(requested_rationale), '\s+', ' ', 'g'), '');
  target_shop_order public.shop_orders;
begin
  if current_user_id is null or not public.is_operator() then
    raise exception using errcode = '42501', message = 'operator_required';
  end if;
  if normalized_rationale is null or char_length(normalized_rationale) not between 10 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_delivery_rationale';
  end if;

  select * into target_shop_order
  from public.shop_orders
  where id = requested_shop_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'shop_order_not_found';
  end if;
  if target_shop_order.status = 'delivered' then return 'duplicate'; end if;
  if target_shop_order.status <> 'shipped'
    or target_shop_order.shipping_carrier is null
    or target_shop_order.tracking_number is null then
    raise exception using errcode = '55000', message = 'shipped_order_required';
  end if;

  insert into public.delivery_confirmations (shop_order_id, confirmed_by, rationale)
  values (target_shop_order.id, current_user_id, normalized_rationale);
  insert into public.order_events (
    entity_type, entity_id, actor_id, from_status, to_status, reason
  ) values (
    'shop_order', target_shop_order.id, current_user_id,
    'shipped', 'delivered', 'delivery_confirmed_by_operator'
  );
  update public.shop_orders
  set status = 'delivered', delivered_at = now(), updated_at = now()
  where id = target_shop_order.id;

  perform public.recompute_order_fulfillment_status(target_shop_order.order_id, current_user_id);
  return 'delivered';
end;
$$;

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
  if normalized_key is null or char_length(normalized_key) not between 20 and 200
    or normalized_key !~ '^[A-Za-z0-9:_-]+$' then
    raise exception using errcode = '22023', message = 'invalid_transfer_idempotency_key';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('payment-transfer:' || requested_shop_order_id::text, 0)
  );

  select * into existing_transfer
  from public.payment_transfers
  where shop_order_id = requested_shop_order_id;

  if found then
    if existing_transfer.idempotency_key <> normalized_key then
      raise exception using errcode = '23505', message = 'transfer_idempotency_conflict';
    end if;
    if not exists (
      select 1 from public.shop_payment_accounts existing_account
      where existing_account.shop_id = existing_transfer.shop_id
        and existing_account.status = 'enabled'
        and existing_account.transfers_enabled
        and existing_account.provider_account_id is not null
    ) then
      raise exception using errcode = '55000', message = 'seller_transfer_account_required';
    end if;
    return query
      select pt.id, spa.provider_account_id, pa.provider_charge_id,
        pt.transfer_cents, pt.currency::text, pt.idempotency_key, so.order_id
      from public.payment_transfers pt
      join public.payment_attempts pa on pa.id = pt.payment_attempt_id
      join public.shop_payment_accounts spa on spa.shop_id = pt.shop_id
      join public.shop_orders so on so.id = pt.shop_order_id
      where pt.id = existing_transfer.id;
    return;
  end if;

  select so.id as shop_order_id, so.order_id, so.shop_id, so.status,
    so.total_cents, so.commission_cents, so.currency,
    pa.id as payment_attempt_id, pa.provider_charge_id,
    spa.provider_account_id
  into target
  from public.shop_orders so
  join public.payment_attempts pa on pa.order_id = so.order_id and pa.status = 'succeeded'
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
  if target.provider_account_id is null or not exists (
    select 1 from public.shop_payment_accounts
    where shop_id = target.shop_id and status = 'enabled' and transfers_enabled
  ) then
    raise exception using errcode = '55000', message = 'seller_transfer_account_required';
  end if;
  if target.total_cents - target.commission_cents <= 0 then
    raise exception using errcode = '23514', message = 'positive_transfer_required';
  end if;

  insert into public.payment_transfers (
    payment_attempt_id, shop_order_id, shop_id, idempotency_key, status,
    gross_cents, commission_cents, transfer_cents, currency
  ) values (
    target.payment_attempt_id, target.shop_order_id, target.shop_id, normalized_key, 'pending',
    target.total_cents, target.commission_cents,
    target.total_cents - target.commission_cents, target.currency
  ) returning id into created_transfer_id;

  return query
    select pt.id, target.provider_account_id, target.provider_charge_id,
      pt.transfer_cents, pt.currency::text, pt.idempotency_key, target.order_id
    from public.payment_transfers pt where pt.id = created_transfer_id;
end;
$$;

create or replace function public.complete_payment_transfer(
  requested_payment_transfer_id uuid,
  requested_provider_transfer_id text,
  requested_amount_cents bigint,
  requested_currency text,
  requested_destination_account_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_transfer_id text := nullif(trim(requested_provider_transfer_id), '');
  normalized_currency text := upper(nullif(trim(requested_currency), ''));
  normalized_destination text := nullif(trim(requested_destination_account_id), '');
  target record;
begin
  if normalized_transfer_id is null or normalized_transfer_id !~ '^tr_[A-Za-z0-9]{8,}$' then
    raise exception using errcode = '22023', message = 'invalid_stripe_transfer_id';
  end if;

  select pt.*, spa.provider_account_id into target
  from public.payment_transfers pt
  join public.shop_payment_accounts spa on spa.shop_id = pt.shop_id
  where pt.id = requested_payment_transfer_id
  for update of pt;

  if not found then
    raise exception using errcode = 'P0002', message = 'payment_transfer_not_found';
  end if;
  if target.provider_transfer_id is not null then
    if target.provider_transfer_id = normalized_transfer_id then return 'duplicate'; end if;
    raise exception using errcode = '23514', message = 'stripe_transfer_identity_conflict';
  end if;
  if target.status <> 'pending'
    or target.transfer_cents <> requested_amount_cents
    or target.currency <> normalized_currency
    or target.provider_account_id <> normalized_destination then
    raise exception using errcode = '23514', message = 'stripe_transfer_reconciliation_failed';
  end if;

  update public.payment_transfers
  set provider_transfer_id = normalized_transfer_id, status = 'submitted',
      submitted_at = now(), last_error_code = null, updated_at = now()
  where id = requested_payment_transfer_id;
  return 'submitted';
end;
$$;

create or replace function public.record_payment_transfer_error(
  requested_payment_transfer_id uuid,
  requested_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_error text := nullif(trim(requested_error_code), '');
begin
  if normalized_error is null or char_length(normalized_error) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'invalid_transfer_error_code';
  end if;
  update public.payment_transfers
  set last_error_code = normalized_error, updated_at = now()
  where id = requested_payment_transfer_id and status = 'pending';
end;
$$;

revoke all on function public.confirm_shop_order_delivery(uuid, text) from public;
revoke all on function public.prepare_payment_transfer(uuid, text) from public;
revoke all on function public.complete_payment_transfer(uuid, text, bigint, text, text) from public;
revoke all on function public.record_payment_transfer_error(uuid, text) from public;

grant execute on function public.confirm_shop_order_delivery(uuid, text) to authenticated;
grant execute on function public.prepare_payment_transfer(uuid, text) to service_role;
grant execute on function public.complete_payment_transfer(uuid, text, bigint, text, text) to service_role;
grant execute on function public.record_payment_transfer_error(uuid, text) to service_role;

comment on function public.prepare_payment_transfer(uuid, text) is
  'Service-role boundary that freezes one idempotent Stripe transfer per delivered shop order.';
