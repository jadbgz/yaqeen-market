create type public.payment_dispute_status as enum (
  'warning_needs_response', 'warning_under_review', 'warning_closed',
  'needs_response', 'under_review', 'won', 'lost'
);

create type public.dispute_funds_status as enum (
  'not_withdrawn', 'withdrawn', 'reinstated'
);

create type public.dispute_recovery_status as enum (
  'held', 'automatic_full', 'manual_partial', 'completed', 'compensation_required'
);

create type public.dispute_transfer_recovery_status as enum (
  'prepared', 'submitted', 'failed', 'compensation_required'
);

create table public.payment_disputes (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
  provider_dispute_id text not null unique check (provider_dispute_id ~ '^du_[A-Za-z0-9]{8,}$'),
  provider_charge_id text not null check (provider_charge_id ~ '^ch_[A-Za-z0-9]{8,}$'),
  status public.payment_dispute_status not null,
  funds_status public.dispute_funds_status not null default 'not_withdrawn',
  recovery_status public.dispute_recovery_status not null default 'held',
  reason_code text not null check (char_length(reason_code) between 2 and 120),
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null check (currency = upper(currency)),
  evidence_due_at timestamptz,
  has_evidence boolean not null default false,
  evidence_past_due boolean not null default false,
  submission_count integer not null default 0 check (submission_count between 0 and 100),
  is_charge_refundable boolean not null,
  opened_at timestamptz not null,
  closed_at timestamptz,
  funds_withdrawn_at timestamptz,
  funds_reinstated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('won', 'lost', 'warning_closed') or closed_at is not null),
  check (funds_status <> 'withdrawn' or funds_withdrawn_at is not null),
  check (funds_status <> 'reinstated' or funds_reinstated_at is not null),
  unique (payment_attempt_id, provider_dispute_id)
);

create table public.payment_dispute_events (
  provider_event_id text primary key references public.stripe_webhook_events(provider_event_id) on delete restrict,
  payment_dispute_id uuid not null references public.payment_disputes(id) on delete restrict,
  event_type text not null check (event_type in (
    'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
    'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated'
  )),
  observed_status public.payment_dispute_status not null,
  observed_funds_status public.dispute_funds_status not null,
  created_at timestamptz not null default now()
);

create table public.payment_dispute_transfer_recoveries (
  id uuid primary key default gen_random_uuid(),
  payment_dispute_id uuid not null references public.payment_disputes(id) on delete restrict,
  payment_transfer_id uuid not null references public.payment_transfers(id) on delete restrict,
  provider_reversal_id text unique,
  idempotency_key text not null unique check (char_length(idempotency_key) between 20 and 200),
  status public.dispute_transfer_recovery_status not null default 'prepared',
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null check (currency = upper(currency)),
  last_error_code text check (last_error_code is null or char_length(last_error_code) between 2 and 120),
  submitted_at timestamptz,
  compensation_required_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_dispute_id, payment_transfer_id),
  check (provider_reversal_id is null or provider_reversal_id ~ '^trr_[A-Za-z0-9]{8,}$'),
  check (status <> 'submitted' or (provider_reversal_id is not null and submitted_at is not null)),
  check (status <> 'failed' or last_error_code is not null),
  check (status <> 'compensation_required' or compensation_required_at is not null)
);

create index payment_disputes_attempt_status_idx
  on public.payment_disputes(payment_attempt_id, status, funds_status);
create index payment_disputes_due_idx
  on public.payment_disputes(status, evidence_due_at) where evidence_due_at is not null;
create index payment_dispute_recoveries_status_idx
  on public.payment_dispute_transfer_recoveries(status, created_at);

alter table public.payment_disputes enable row level security;
alter table public.payment_dispute_events enable row level security;
alter table public.payment_dispute_transfer_recoveries enable row level security;

create policy payment_disputes_operator_read on public.payment_disputes
  for select to authenticated using (public.is_operator());
create policy payment_dispute_events_operator_read on public.payment_dispute_events
  for select to authenticated using (public.is_operator());
create policy payment_dispute_recoveries_operator_read on public.payment_dispute_transfer_recoveries
  for select to authenticated using (public.is_operator());

grant select on public.payment_disputes, public.payment_dispute_events,
  public.payment_dispute_transfer_recoveries to authenticated, service_role;

create or replace function public.apply_stripe_dispute_snapshot(
  requested_provider_event_id text,
  requested_event_type text,
  requested_provider_dispute_id text,
  requested_provider_charge_id text,
  requested_status text,
  requested_funds_action text,
  requested_reason_code text,
  requested_amount_cents bigint,
  requested_currency text,
  requested_evidence_due_epoch bigint,
  requested_has_evidence boolean,
  requested_evidence_past_due boolean,
  requested_submission_count integer,
  requested_is_charge_refundable boolean,
  requested_opened_epoch bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_dispute_id text := nullif(trim(requested_provider_dispute_id), '');
  normalized_charge_id text := nullif(trim(requested_provider_charge_id), '');
  normalized_reason text := nullif(trim(requested_reason_code), '');
  normalized_currency text := upper(nullif(trim(requested_currency), ''));
  target_attempt public.payment_attempts;
  target_dispute public.payment_disputes;
  dispute_id uuid;
  next_funds_status public.dispute_funds_status;
  next_recovery_status public.dispute_recovery_status;
  terminal boolean := requested_status in ('won', 'lost', 'warning_closed');
begin
  if requested_provider_event_id is null or requested_provider_event_id !~ '^evt_[A-Za-z0-9]{8,}$'
    or requested_event_type not in (
      'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
      'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated'
    ) then
    raise exception using errcode = '22023', message = 'invalid_dispute_event_identity';
  end if;
  if normalized_dispute_id is null or normalized_dispute_id !~ '^du_[A-Za-z0-9]{8,}$'
    or normalized_charge_id is null or normalized_charge_id !~ '^ch_[A-Za-z0-9]{8,}$'
    or requested_status not in (
      'warning_needs_response', 'warning_under_review', 'warning_closed',
      'needs_response', 'under_review', 'won', 'lost'
    ) or requested_funds_action not in ('none', 'withdrawn', 'reinstated') then
    raise exception using errcode = '22023', message = 'invalid_stripe_dispute_state';
  end if;
  if normalized_reason is null or char_length(normalized_reason) not between 2 and 120
    or requested_amount_cents is null or requested_amount_cents <= 0
    or normalized_currency is null or char_length(normalized_currency) <> 3
    or requested_has_evidence is null or requested_evidence_past_due is null
    or requested_submission_count is null or requested_submission_count not between 0 and 100
    or requested_is_charge_refundable is null or requested_opened_epoch is null or requested_opened_epoch <= 0
    or (requested_evidence_due_epoch is not null and requested_evidence_due_epoch < 0) then
    raise exception using errcode = '22023', message = 'invalid_stripe_dispute_snapshot';
  end if;

  select * into target_attempt from public.payment_attempts
  where provider_charge_id = normalized_charge_id and status = 'succeeded' for update;
  if not found then raise exception using errcode = 'P0002', message = 'disputed_charge_not_found'; end if;
  if target_attempt.currency <> normalized_currency then
    raise exception using errcode = '23514', message = 'stripe_dispute_currency_mismatch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('payment-dispute:' || normalized_dispute_id, 0)
  );
  select * into target_dispute from public.payment_disputes
  where provider_dispute_id = normalized_dispute_id for update;
  if found and (target_dispute.payment_attempt_id <> target_attempt.id
    or target_dispute.provider_charge_id <> normalized_charge_id
    or target_dispute.amount_cents <> requested_amount_cents
    or target_dispute.currency <> normalized_currency) then
    raise exception using errcode = '23514', message = 'stripe_dispute_identity_conflict';
  end if;

  next_funds_status := case
    when found and target_dispute.funds_status = 'reinstated'
      then 'reinstated'::public.dispute_funds_status
    when requested_funds_action = 'withdrawn' then 'withdrawn'::public.dispute_funds_status
    when requested_funds_action = 'reinstated' then 'reinstated'::public.dispute_funds_status
    when found then target_dispute.funds_status
    else 'not_withdrawn'::public.dispute_funds_status
  end;
  next_recovery_status := case
    when next_funds_status = 'reinstated' and exists (
      select 1 from public.payment_dispute_transfer_recoveries r
      where r.payment_dispute_id = target_dispute.id and r.status = 'submitted'
    ) then 'compensation_required'::public.dispute_recovery_status
    when next_funds_status = 'withdrawn' and requested_amount_cents = target_attempt.amount_cents
      then 'automatic_full'::public.dispute_recovery_status
    when next_funds_status = 'withdrawn' then 'manual_partial'::public.dispute_recovery_status
    when found then target_dispute.recovery_status
    else 'held'::public.dispute_recovery_status
  end;

  insert into public.payment_disputes (
    payment_attempt_id, provider_dispute_id, provider_charge_id, status, funds_status,
    recovery_status, reason_code, amount_cents, currency, evidence_due_at,
    has_evidence, evidence_past_due, submission_count, is_charge_refundable,
    opened_at, closed_at, funds_withdrawn_at, funds_reinstated_at
  ) values (
    target_attempt.id, normalized_dispute_id, normalized_charge_id,
    requested_status::public.payment_dispute_status, next_funds_status, next_recovery_status,
    normalized_reason, requested_amount_cents, normalized_currency,
    case when requested_evidence_due_epoch is null or requested_evidence_due_epoch = 0 then null
      else to_timestamp(requested_evidence_due_epoch) end,
    requested_has_evidence, requested_evidence_past_due, requested_submission_count,
    requested_is_charge_refundable, to_timestamp(requested_opened_epoch),
    case when terminal then now() else null end,
    case when next_funds_status in ('withdrawn', 'reinstated')
      then coalesce(target_dispute.funds_withdrawn_at,
        case when requested_funds_action = 'withdrawn' then now() else null end)
      else null end,
    case when next_funds_status = 'reinstated'
      then coalesce(target_dispute.funds_reinstated_at, now())
      else null end
  ) on conflict (provider_dispute_id) do update set
    status = excluded.status,
    funds_status = excluded.funds_status,
    recovery_status = excluded.recovery_status,
    reason_code = excluded.reason_code,
    evidence_due_at = excluded.evidence_due_at,
    has_evidence = excluded.has_evidence,
    evidence_past_due = excluded.evidence_past_due,
    submission_count = excluded.submission_count,
    is_charge_refundable = excluded.is_charge_refundable,
    closed_at = case when terminal then coalesce(public.payment_disputes.closed_at, now()) else null end,
    funds_withdrawn_at = case when requested_funds_action = 'withdrawn'
      then coalesce(public.payment_disputes.funds_withdrawn_at, now())
      else public.payment_disputes.funds_withdrawn_at end,
    funds_reinstated_at = case when requested_funds_action = 'reinstated'
      then coalesce(public.payment_disputes.funds_reinstated_at, now())
      else public.payment_disputes.funds_reinstated_at end,
    updated_at = now()
  returning id into dispute_id;

  if requested_funds_action = 'reinstated' then
    update public.payment_dispute_transfer_recoveries
    set status = 'compensation_required', compensation_required_at = coalesce(compensation_required_at, now()),
      updated_at = now()
    where payment_dispute_id = dispute_id and status = 'submitted';
  end if;

  insert into public.payment_dispute_events (
    provider_event_id, payment_dispute_id, event_type, observed_status, observed_funds_status
  ) values (
    requested_provider_event_id, dispute_id, requested_event_type,
    requested_status::public.payment_dispute_status, next_funds_status
  ) on conflict (provider_event_id) do nothing;
  return dispute_id;
end;
$$;

create or replace function public.prepare_dispute_transfer_recoveries(
  requested_payment_dispute_id uuid
)
returns table (
  recovery_id uuid, provider_transfer_id text, recovery_amount_cents bigint,
  recovery_currency text, recovery_idempotency_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare target record;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dispute-recovery:' || requested_payment_dispute_id::text, 0)
  );
  select pd.*, pa.amount_cents as payment_amount into target
  from public.payment_disputes pd join public.payment_attempts pa on pa.id = pd.payment_attempt_id
  where pd.id = requested_payment_dispute_id for update of pd, pa;
  if not found then raise exception using errcode = 'P0002', message = 'payment_dispute_not_found'; end if;
  if target.funds_status <> 'withdrawn' then
    raise exception using errcode = '55000', message = 'dispute_funds_not_withdrawn';
  end if;
  if target.amount_cents <> target.payment_amount then return; end if;

  insert into public.payment_dispute_transfer_recoveries (
    payment_dispute_id, payment_transfer_id, idempotency_key, amount_cents, currency
  )
  select target.id, pt.id,
    'dispute-reversal:' || target.id::text || ':' || pt.id::text || ':v1',
    pt.transfer_cents - pt.reversed_cents, pt.currency
  from public.payment_transfers pt
  where pt.payment_attempt_id = target.payment_attempt_id
    and pt.status in ('submitted', 'paid')
    and pt.provider_transfer_id is not null
    and pt.reversed_cents = 0
    and not exists (
      select 1 from public.payment_transfer_reversals rr
      where rr.payment_transfer_id = pt.id and rr.status in ('prepared', 'submitted')
    )
  on conflict (payment_dispute_id, payment_transfer_id) do nothing;

  return query
  select r.id, pt.provider_transfer_id, r.amount_cents, r.currency::text, r.idempotency_key
  from public.payment_dispute_transfer_recoveries r
  join public.payment_transfers pt on pt.id = r.payment_transfer_id
  where r.payment_dispute_id = target.id and r.status in ('prepared', 'failed')
  order by r.created_at, r.id;
end;
$$;

create or replace function public.complete_dispute_transfer_recovery(
  requested_recovery_id uuid,
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
  normalized_reversal_id text := nullif(trim(requested_provider_reversal_id), '');
  normalized_currency text := upper(nullif(trim(requested_currency), ''));
  target record;
begin
  if normalized_reversal_id is null or normalized_reversal_id !~ '^trr_[A-Za-z0-9]{8,}$' then
    raise exception using errcode = '22023', message = 'invalid_stripe_reversal_id';
  end if;
  select r.*, pt.status as transfer_status, pt.reversed_cents into target
  from public.payment_dispute_transfer_recoveries r
  join public.payment_transfers pt on pt.id = r.payment_transfer_id
  where r.id = requested_recovery_id for update of r, pt;
  if not found then raise exception using errcode = 'P0002', message = 'dispute_recovery_not_found'; end if;
  if target.provider_reversal_id is not null then
    if target.provider_reversal_id = normalized_reversal_id
      and target.amount_cents = requested_amount_cents and target.currency = normalized_currency
      then return 'duplicate'; end if;
    raise exception using errcode = '23514', message = 'stripe_reversal_identity_conflict';
  end if;
  if target.amount_cents <> requested_amount_cents or target.currency <> normalized_currency
    or target.transfer_status not in ('submitted', 'paid') or target.reversed_cents <> 0 then
    raise exception using errcode = '23514', message = 'stripe_dispute_recovery_mismatch';
  end if;
  update public.payment_dispute_transfer_recoveries
  set provider_reversal_id = normalized_reversal_id, status = 'submitted', submitted_at = now(),
    last_error_code = null, updated_at = now() where id = target.id;
  update public.payment_transfers
  set status = 'reversed', reversed_cents = requested_amount_cents, reversed_at = now(), updated_at = now()
  where id = target.payment_transfer_id;
  if not exists (
    select 1 from public.payment_transfers pt
    where pt.payment_attempt_id = (
      select pd.payment_attempt_id from public.payment_disputes pd where pd.id = target.payment_dispute_id
    ) and pt.status in ('submitted', 'paid')
  ) then
    update public.payment_disputes set recovery_status = 'completed', updated_at = now()
    where id = target.payment_dispute_id and funds_status = 'withdrawn';
  end if;
  return 'submitted';
end;
$$;

create or replace function public.record_dispute_recovery_error(
  requested_recovery_id uuid, requested_error_code text
)
returns void language plpgsql security definer set search_path = '' as $$
declare normalized_error text := nullif(trim(requested_error_code), '');
begin
  if normalized_error is null or char_length(normalized_error) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'invalid_recovery_error_code';
  end if;
  update public.payment_dispute_transfer_recoveries
  set status = 'failed', last_error_code = normalized_error, updated_at = now()
  where id = requested_recovery_id and status <> 'submitted';
end; $$;

-- A dispute or inquiry freezes every not-yet-created transfer for the charge.
create or replace function public.payment_attempt_has_transfer_hold(requested_payment_attempt_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.payment_disputes pd
    where pd.payment_attempt_id = requested_payment_attempt_id
      and not (pd.status in ('won', 'warning_closed') and pd.funds_status <> 'withdrawn')
  );
$$;

-- Replace the transfer preparation boundary to enforce the dispute hold atomically.
create or replace function public.prepare_payment_transfer(
  requested_shop_order_id uuid,
  requested_idempotency_key text
)
returns table (
  payment_transfer_id uuid, provider_account_id text, provider_charge_id text,
  transfer_amount_cents bigint, transfer_currency text, transfer_idempotency_key text,
  aggregate_order_id uuid
)
language plpgsql security definer set search_path = '' as $$
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
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment-transfer:' || requested_shop_order_id::text, 0));
  select * into existing_transfer from public.payment_transfers where shop_order_id = requested_shop_order_id;
  if found then
    if existing_transfer.idempotency_key <> normalized_key then
      raise exception using errcode = '23505', message = 'transfer_idempotency_conflict';
    end if;
    if public.payment_attempt_has_transfer_hold(existing_transfer.payment_attempt_id) then
      raise exception using errcode = '55000', message = 'payment_dispute_hold_active';
    end if;
    if not exists (select 1 from public.shop_payment_accounts a where a.shop_id = existing_transfer.shop_id
      and a.status = 'enabled' and a.transfers_enabled and a.provider_account_id is not null) then
      raise exception using errcode = '55000', message = 'seller_transfer_account_required';
    end if;
    return query select pt.id, spa.provider_account_id, pa.provider_charge_id, pt.transfer_cents,
      pt.currency::text, pt.idempotency_key, so.order_id from public.payment_transfers pt
      join public.payment_attempts pa on pa.id = pt.payment_attempt_id
      join public.shop_payment_accounts spa on spa.shop_id = pt.shop_id
      join public.shop_orders so on so.id = pt.shop_order_id where pt.id = existing_transfer.id;
    return;
  end if;
  select so.id as shop_order_id, so.order_id, so.shop_id, so.status, so.total_cents,
    so.commission_cents, so.currency, pa.id as payment_attempt_id, pa.provider_charge_id,
    spa.provider_account_id into target from public.shop_orders so
  join public.payment_attempts pa on pa.order_id = so.order_id and pa.status = 'succeeded'
  join public.shop_payment_accounts spa on spa.shop_id = so.shop_id
  where so.id = requested_shop_order_id for update of so, pa, spa;
  if not found then raise exception using errcode = 'P0002', message = 'transfer_source_not_found'; end if;
  if target.status <> 'delivered' then raise exception using errcode = '55000', message = 'delivered_shop_order_required'; end if;
  if target.provider_charge_id is null then raise exception using errcode = '55000', message = 'succeeded_charge_required'; end if;
  if public.payment_attempt_has_transfer_hold(target.payment_attempt_id) then
    raise exception using errcode = '55000', message = 'payment_dispute_hold_active';
  end if;
  if target.provider_account_id is null or not exists (select 1 from public.shop_payment_accounts
    where shop_id = target.shop_id and status = 'enabled' and transfers_enabled) then
    raise exception using errcode = '55000', message = 'seller_transfer_account_required';
  end if;
  if target.total_cents - target.commission_cents <= 0 then
    raise exception using errcode = '23514', message = 'positive_transfer_required';
  end if;
  insert into public.payment_transfers (payment_attempt_id, shop_order_id, shop_id, idempotency_key,
    status, gross_cents, commission_cents, transfer_cents, currency)
  values (target.payment_attempt_id, target.shop_order_id, target.shop_id, normalized_key, 'pending',
    target.total_cents, target.commission_cents, target.total_cents-target.commission_cents, target.currency)
  returning id into created_transfer_id;
  return query select pt.id, target.provider_account_id, target.provider_charge_id, pt.transfer_cents,
    pt.currency::text, pt.idempotency_key, target.order_id from public.payment_transfers pt
    where pt.id = created_transfer_id;
end; $$;

revoke all on function public.apply_stripe_dispute_snapshot(text,text,text,text,text,text,text,bigint,text,bigint,boolean,boolean,integer,boolean,bigint) from public;
revoke all on function public.prepare_dispute_transfer_recoveries(uuid) from public;
revoke all on function public.complete_dispute_transfer_recovery(uuid,text,bigint,text) from public;
revoke all on function public.record_dispute_recovery_error(uuid,text) from public;
revoke all on function public.payment_attempt_has_transfer_hold(uuid) from public;
grant execute on function public.apply_stripe_dispute_snapshot(text,text,text,text,text,text,text,bigint,text,bigint,boolean,boolean,integer,boolean,bigint) to service_role;
grant execute on function public.prepare_dispute_transfer_recoveries(uuid) to service_role;
grant execute on function public.complete_dispute_transfer_recovery(uuid,text,bigint,text) to service_role;
grant execute on function public.record_dispute_recovery_error(uuid,text) to service_role;
grant execute on function public.payment_attempt_has_transfer_hold(uuid) to service_role;

comment on function public.apply_stripe_dispute_snapshot(text,text,text,text,text,text,text,bigint,text,bigint,boolean,boolean,integer,boolean,bigint) is
  'Signed-webhook boundary for immutable Stripe dispute identity, evidence deadlines and funds state.';
comment on function public.prepare_dispute_transfer_recoveries(uuid) is
  'Creates exact seller-net reversals only for a full-charge dispute after Stripe confirms funds withdrawal.';
