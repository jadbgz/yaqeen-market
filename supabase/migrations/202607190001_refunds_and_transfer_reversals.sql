do $$
declare target_constraint record;
begin
  for target_constraint in
    select conname
    from pg_catalog.pg_constraint
    where conrelid = 'public.shop_orders'::regclass
      and contype = 'c'
      and (
        pg_catalog.pg_get_constraintdef(oid) like '%shipped_at IS NOT NULL%tracking_number IS NOT NULL%'
        or pg_catalog.pg_get_constraintdef(oid) like '%delivered_at IS NOT NULL%'
      )
  loop
    execute format('alter table public.shop_orders drop constraint %I', target_constraint.conname);
  end loop;
end;
$$;

alter table public.shop_orders
  drop constraint shop_orders_shipping_carrier_state,
  add constraint shop_orders_shipping_evidence_consistent check (
    (shipped_at is null and tracking_number is null and shipping_carrier is null)
    or (shipped_at is not null and tracking_number is not null and shipping_carrier is not null)
  ),
  add constraint shop_orders_active_shipping_state check (
    status not in ('shipped', 'delivered')
    or (shipped_at is not null and tracking_number is not null and shipping_carrier is not null)
  ),
  add constraint shop_orders_delivery_evidence_consistent check (
    delivered_at is null or shipped_at is not null
  ),
  add constraint shop_orders_delivered_state check (
    status <> 'delivered' or delivered_at is not null
  );

do $$
declare target_constraint record;
begin
  for target_constraint in
    select conname from pg_catalog.pg_constraint
    where conrelid = 'public.payment_transfers'::regclass and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) like '%paid_at IS NOT NULL%'
  loop
    execute format('alter table public.payment_transfers drop constraint %I', target_constraint.conname);
  end loop;
end;
$$;
alter table public.payment_transfers
  add constraint payment_transfers_paid_state check (status <> 'paid' or paid_at is not null);

create type public.payment_refund_status as enum (
  'prepared', 'submitted', 'pending', 'succeeded', 'failed', 'cancelled'
);
create type public.transfer_reversal_status as enum (
  'prepared', 'submitted', 'failed'
);

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
  shop_order_id uuid not null unique references public.shop_orders(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  provider_refund_id text unique,
  idempotency_key text not null unique check (char_length(idempotency_key) between 20 and 200),
  status public.payment_refund_status not null default 'prepared',
  reason_code text not null check (reason_code in ('requested_by_customer', 'duplicate', 'fraudulent')),
  rationale text not null check (char_length(rationale) between 10 and 1000),
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null check (currency = upper(currency)),
  last_error_code text check (last_error_code is null or char_length(last_error_code) between 2 and 120),
  submitted_at timestamptz,
  succeeded_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider_refund_id is null or provider_refund_id ~ '^re_[A-Za-z0-9]{8,}$'),
  check (status = 'prepared' or provider_refund_id is not null),
  check (status <> 'succeeded' or succeeded_at is not null),
  check (status <> 'failed' or (failed_at is not null and last_error_code is not null))
);

create table public.payment_transfer_reversals (
  id uuid primary key default gen_random_uuid(),
  payment_refund_id uuid not null unique references public.payment_refunds(id) on delete restrict,
  payment_transfer_id uuid not null references public.payment_transfers(id) on delete restrict,
  provider_reversal_id text unique,
  idempotency_key text not null unique check (char_length(idempotency_key) between 20 and 200),
  status public.transfer_reversal_status not null default 'prepared',
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null check (currency = upper(currency)),
  last_error_code text check (last_error_code is null or char_length(last_error_code) between 2 and 120),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider_reversal_id is null or provider_reversal_id ~ '^trr_[A-Za-z0-9]{8,}$'),
  check (status <> 'submitted' or (provider_reversal_id is not null and submitted_at is not null)),
  check (status <> 'failed' or last_error_code is not null)
);

create index payment_refunds_status_created_idx on public.payment_refunds(status, created_at);
create index payment_transfer_reversals_status_created_idx on public.payment_transfer_reversals(status, created_at);
alter table public.payment_refunds enable row level security;
alter table public.payment_transfer_reversals enable row level security;
create policy payment_refunds_party_read on public.payment_refunds
  for select to authenticated using (
    public.can_read_shop_order(shop_order_id) or public.is_operator()
  );
create policy payment_transfer_reversals_operator_read on public.payment_transfer_reversals
  for select to authenticated using (public.is_operator());
grant select on public.payment_refunds, public.payment_transfer_reversals to authenticated, service_role;

create or replace function public.request_shop_order_refund(
  requested_shop_order_id uuid,
  requested_reason_code text,
  requested_rationale text,
  requested_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_rationale text := nullif(regexp_replace(trim(requested_rationale), '\s+', ' ', 'g'), '');
  normalized_key text := nullif(trim(requested_idempotency_key), '');
  target record;
  existing public.payment_refunds;
  created_id uuid;
begin
  if current_user_id is null or not public.is_operator() then
    raise exception using errcode = '42501', message = 'operator_required';
  end if;
  if requested_reason_code not in ('requested_by_customer', 'duplicate', 'fraudulent') then
    raise exception using errcode = '22023', message = 'invalid_refund_reason';
  end if;
  if normalized_rationale is null or char_length(normalized_rationale) not between 10 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_refund_rationale';
  end if;
  if normalized_key is null or char_length(normalized_key) not between 20 and 200
    or normalized_key !~ '^[A-Za-z0-9:_-]+$' then
    raise exception using errcode = '22023', message = 'invalid_refund_idempotency_key';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('payment-refund:' || requested_shop_order_id::text, 0)
  );
  select * into existing from public.payment_refunds where shop_order_id = requested_shop_order_id;
  if found then
    if existing.idempotency_key <> normalized_key
      or existing.reason_code <> requested_reason_code
      or existing.rationale <> normalized_rationale then
      raise exception using errcode = '23505', message = 'refund_request_conflict';
    end if;
    return existing.id;
  end if;

  select so.id as shop_order_id, so.status, so.total_cents, so.currency,
    pa.id as payment_attempt_id, pa.status as payment_status, pa.provider_charge_id
  into target
  from public.shop_orders so
  join public.payment_attempts pa on pa.order_id = so.order_id and pa.status = 'succeeded'
  where so.id = requested_shop_order_id
  for update of so, pa;
  if not found then raise exception using errcode = 'P0002', message = 'refund_source_not_found'; end if;
  if target.status not in ('paid', 'preparing', 'shipped', 'delivered') then
    raise exception using errcode = '55000', message = 'shop_order_not_refundable';
  end if;
  if target.provider_charge_id is null then
    raise exception using errcode = '55000', message = 'succeeded_charge_required';
  end if;

  insert into public.payment_refunds (
    payment_attempt_id, shop_order_id, requested_by, idempotency_key,
    reason_code, rationale, amount_cents, currency
  ) values (
    target.payment_attempt_id, target.shop_order_id, current_user_id, normalized_key,
    requested_reason_code, normalized_rationale, target.total_cents, target.currency
  ) returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.attach_stripe_refund(
  requested_payment_refund_id uuid,
  requested_provider_refund_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_id text := nullif(trim(requested_provider_refund_id), '');
  target public.payment_refunds;
begin
  if normalized_id is null or normalized_id !~ '^re_[A-Za-z0-9]{8,}$' then
    raise exception using errcode = '22023', message = 'invalid_stripe_refund_id';
  end if;
  select * into target from public.payment_refunds where id = requested_payment_refund_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'payment_refund_not_found'; end if;
  if target.provider_refund_id is not null then
    if target.provider_refund_id = normalized_id then return 'duplicate'; end if;
    raise exception using errcode = '23514', message = 'stripe_refund_identity_conflict';
  end if;
  update public.payment_refunds
  set provider_refund_id = normalized_id, status = 'submitted', submitted_at = now(), updated_at = now()
  where id = target.id;
  return 'submitted';
end;
$$;

create or replace function public.apply_stripe_refund_state(
  requested_payment_refund_id uuid,
  requested_provider_refund_id text,
  requested_status text,
  requested_amount_cents bigint,
  requested_currency text,
  requested_failure_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_id text := nullif(trim(requested_provider_refund_id), '');
  normalized_currency text := upper(nullif(trim(requested_currency), ''));
  normalized_error text := nullif(trim(requested_failure_reason), '');
  target record;
  total_shops integer;
  refunded_shops integer;
  next_order_status public.order_status;
begin
  if normalized_id is null or normalized_id !~ '^re_[A-Za-z0-9]{8,}$'
    or requested_status not in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled') then
    raise exception using errcode = '22023', message = 'invalid_stripe_refund_state';
  end if;
  select pr.*, so.order_id, so.status as shop_order_status into target
  from public.payment_refunds pr join public.shop_orders so on so.id = pr.shop_order_id
  where pr.id = requested_payment_refund_id for update of pr, so;
  if not found then raise exception using errcode = 'P0002', message = 'payment_refund_not_found'; end if;
  if target.provider_refund_id is not null and target.provider_refund_id <> normalized_id then
    raise exception using errcode = '23514', message = 'stripe_refund_identity_conflict';
  end if;
  if target.amount_cents <> requested_amount_cents or target.currency <> normalized_currency then
    raise exception using errcode = '23514', message = 'stripe_refund_reconciliation_failed';
  end if;
  if target.status = 'succeeded' and requested_status <> 'succeeded' then return 'stale'; end if;

  if requested_status = 'succeeded' then
    if target.status = 'succeeded' then return 'duplicate'; end if;
    insert into public.order_events (entity_type, entity_id, actor_id, from_status, to_status, reason)
    values ('shop_order', target.shop_order_id, null, target.shop_order_status::text, 'refunded', 'stripe_refund_succeeded');
    update public.shop_orders set status = 'refunded', updated_at = now() where id = target.shop_order_id;
    select count(*), count(*) filter (where status = 'refunded')
    into total_shops, refunded_shops from public.shop_orders where order_id = target.order_id;
    next_order_status := case when total_shops = refunded_shops then 'refunded' else 'partially_refunded' end;
    insert into public.order_events (entity_type, entity_id, actor_id, from_status, to_status, reason)
    select 'order', o.id, null, o.status::text, next_order_status::text, 'stripe_refund_aggregate_recomputed'
    from public.orders o where o.id = target.order_id and o.status <> next_order_status;
    update public.orders set status = next_order_status, updated_at = now() where id = target.order_id;
    update public.payment_refunds set provider_refund_id = normalized_id, status = 'succeeded',
      succeeded_at = now(), failed_at = null, last_error_code = null, updated_at = now()
    where id = target.id;
    return 'succeeded';
  end if;

  if requested_status = 'failed' then
    if normalized_error is null or char_length(normalized_error) not between 2 and 120 then
      raise exception using errcode = '22023', message = 'refund_failure_reason_required';
    end if;
    update public.payment_refunds set provider_refund_id = normalized_id, status = 'failed',
      failed_at = now(), last_error_code = normalized_error, updated_at = now() where id = target.id;
    return 'failed';
  end if;

  update public.payment_refunds set provider_refund_id = normalized_id,
    status = case when requested_status = 'canceled' then 'cancelled'::public.payment_refund_status else 'pending'::public.payment_refund_status end,
    submitted_at = coalesce(submitted_at, now()), updated_at = now() where id = target.id;
  return requested_status;
end;
$$;

create or replace function public.prepare_transfer_reversal(
  requested_payment_refund_id uuid,
  requested_idempotency_key text
)
returns table (
  reversal_record_id uuid, provider_transfer_id text, reversal_amount_cents bigint,
  reversal_currency text, reversal_idempotency_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_key text := nullif(trim(requested_idempotency_key), '');
  target record;
  existing public.payment_transfer_reversals;
  created_id uuid;
begin
  if normalized_key is null or char_length(normalized_key) not between 20 and 200
    or normalized_key !~ '^[A-Za-z0-9:_-]+$' then
    raise exception using errcode = '22023', message = 'invalid_reversal_idempotency_key';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('transfer-reversal:' || requested_payment_refund_id::text, 0)
  );
  select * into existing from public.payment_transfer_reversals where payment_refund_id = requested_payment_refund_id;
  if found then
    if existing.idempotency_key <> normalized_key then
      raise exception using errcode = '23505', message = 'reversal_idempotency_conflict';
    end if;
    return query select ptr.id, pt.provider_transfer_id, ptr.amount_cents, ptr.currency::text, ptr.idempotency_key
      from public.payment_transfer_reversals ptr join public.payment_transfers pt on pt.id = ptr.payment_transfer_id
      where ptr.id = existing.id;
    return;
  end if;
  select pr.status as refund_status, pr.currency, pt.id as transfer_id,
    pt.provider_transfer_id, pt.status as transfer_status, pt.transfer_cents, pt.reversed_cents
  into target from public.payment_refunds pr
  join public.payment_transfers pt on pt.shop_order_id = pr.shop_order_id
  where pr.id = requested_payment_refund_id for update of pr, pt;
  if not found then return; end if;
  if target.refund_status <> 'succeeded' or target.transfer_status <> 'submitted'
    or target.provider_transfer_id is null or target.reversed_cents <> 0 then
    raise exception using errcode = '55000', message = 'transfer_not_reversible';
  end if;
  insert into public.payment_transfer_reversals (
    payment_refund_id, payment_transfer_id, idempotency_key, amount_cents, currency
  ) values (
    requested_payment_refund_id, target.transfer_id, normalized_key, target.transfer_cents, target.currency
  ) returning id into created_id;
  return query select ptr.id, target.provider_transfer_id, ptr.amount_cents, ptr.currency::text, ptr.idempotency_key
    from public.payment_transfer_reversals ptr where ptr.id = created_id;
end;
$$;

create or replace function public.complete_transfer_reversal(
  requested_reversal_record_id uuid,
  requested_provider_reversal_id text,
  requested_amount_cents bigint,
  requested_currency text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_id text := nullif(trim(requested_provider_reversal_id), '');
  normalized_currency text := upper(nullif(trim(requested_currency), ''));
  target record;
begin
  if normalized_id is null or normalized_id !~ '^trr_[A-Za-z0-9]{8,}$' then
    raise exception using errcode = '22023', message = 'invalid_stripe_reversal_id';
  end if;
  select ptr.*, pt.status as transfer_status into target
  from public.payment_transfer_reversals ptr join public.payment_transfers pt on pt.id = ptr.payment_transfer_id
  where ptr.id = requested_reversal_record_id for update of ptr, pt;
  if not found then raise exception using errcode = 'P0002', message = 'transfer_reversal_not_found'; end if;
  if target.provider_reversal_id is not null then
    if target.provider_reversal_id = normalized_id
      and target.amount_cents = requested_amount_cents
      and target.currency = normalized_currency then return 'duplicate'; end if;
    raise exception using errcode = '23514', message = 'stripe_reversal_identity_conflict';
  end if;
  if target.amount_cents <> requested_amount_cents or target.currency <> normalized_currency
    or target.transfer_status <> 'submitted' then
    raise exception using errcode = '23514', message = 'stripe_reversal_reconciliation_failed';
  end if;
  update public.payment_transfer_reversals set provider_reversal_id = normalized_id,
    status = 'submitted', submitted_at = now(), last_error_code = null, updated_at = now()
  where id = target.id;
  update public.payment_transfers set status = 'reversed', reversed_cents = requested_amount_cents,
    reversed_at = now(), updated_at = now() where id = target.payment_transfer_id;
  return 'submitted';
end;
$$;

create or replace function public.record_transfer_reversal_error(
  requested_reversal_record_id uuid, requested_error_code text
)
returns void language plpgsql security definer set search_path = '' as $$
declare normalized_error text := nullif(trim(requested_error_code), '');
begin
  if normalized_error is null or char_length(normalized_error) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'invalid_reversal_error_code';
  end if;
  update public.payment_transfer_reversals set status = 'failed', last_error_code = normalized_error,
    updated_at = now() where id = requested_reversal_record_id and status <> 'submitted';
end; $$;

revoke all on function public.request_shop_order_refund(uuid,text,text,text) from public;
revoke all on function public.attach_stripe_refund(uuid,text) from public;
revoke all on function public.apply_stripe_refund_state(uuid,text,text,bigint,text,text) from public;
revoke all on function public.prepare_transfer_reversal(uuid,text) from public;
revoke all on function public.complete_transfer_reversal(uuid,text,bigint,text) from public;
revoke all on function public.record_transfer_reversal_error(uuid,text) from public;
grant execute on function public.request_shop_order_refund(uuid,text,text,text) to authenticated;
grant execute on function public.attach_stripe_refund(uuid,text) to service_role;
grant execute on function public.apply_stripe_refund_state(uuid,text,text,bigint,text,text) to service_role;
grant execute on function public.prepare_transfer_reversal(uuid,text) to service_role;
grant execute on function public.complete_transfer_reversal(uuid,text,bigint,text) to service_role;
grant execute on function public.record_transfer_reversal_error(uuid,text) to service_role;
