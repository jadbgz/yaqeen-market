create type public.connected_payment_account_status as enum (
  'not_started',
  'onboarding',
  'restricted',
  'enabled',
  'disabled'
);

create type public.payment_attempt_status as enum (
  'requires_payment_method',
  'requires_action',
  'processing',
  'succeeded',
  'cancelled',
  'failed'
);

create type public.payment_transfer_status as enum (
  'pending',
  'submitted',
  'paid',
  'reversed',
  'failed'
);

create type public.webhook_event_status as enum (
  'received',
  'processing',
  'processed',
  'ignored',
  'failed'
);

create table public.shop_payment_accounts (
  shop_id uuid primary key references public.shops(id) on delete restrict,
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_account_id text unique,
  status public.connected_payment_account_status not null default 'not_started',
  transfers_enabled boolean not null default false,
  requirements_due_count integer not null default 0 check (requirements_due_count between 0 and 1000),
  connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider_account_id is null or provider_account_id ~ '^acct_[A-Za-z0-9]{8,}$'),
  check (status <> 'enabled' or (provider_account_id is not null and transfers_enabled)),
  check ((provider_account_id is not null) = (connected_at is not null))
);

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  attempt_number smallint not null check (attempt_number between 1 and 100),
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_payment_intent_id text unique,
  idempotency_key text not null unique check (char_length(idempotency_key) between 20 and 200),
  status public.payment_attempt_status not null default 'requires_payment_method',
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null check (currency = upper(currency)),
  last_error_code text check (last_error_code is null or char_length(last_error_code) between 2 and 120),
  succeeded_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, attempt_number),
  check (provider_payment_intent_id is null or provider_payment_intent_id ~ '^pi_[A-Za-z0-9]{8,}$'),
  check ((status = 'succeeded') = (succeeded_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);

create table public.payment_transfers (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
  shop_order_id uuid not null references public.shop_orders(id) on delete restrict,
  shop_id uuid not null references public.shop_payment_accounts(shop_id) on delete restrict,
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_transfer_id text unique,
  idempotency_key text not null unique check (char_length(idempotency_key) between 20 and 200),
  status public.payment_transfer_status not null default 'pending',
  gross_cents bigint not null check (gross_cents > 0),
  commission_cents bigint not null check (commission_cents >= 0),
  transfer_cents bigint not null check (transfer_cents > 0),
  reversed_cents bigint not null default 0 check (reversed_cents >= 0),
  currency char(3) not null check (currency = upper(currency)),
  submitted_at timestamptz,
  paid_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_attempt_id, shop_order_id),
  check (provider_transfer_id is null or provider_transfer_id ~ '^tr_[A-Za-z0-9]{8,}$'),
  check (gross_cents = commission_cents + transfer_cents),
  check (reversed_cents <= transfer_cents),
  check (status not in ('submitted', 'paid', 'reversed') or submitted_at is not null),
  check (status not in ('paid', 'reversed') or paid_at is not null),
  check (status <> 'reversed' or (reversed_at is not null and reversed_cents > 0))
);

create table public.stripe_webhook_events (
  provider_event_id text primary key check (provider_event_id ~ '^evt_[A-Za-z0-9]{8,}$'),
  event_type text not null check (char_length(event_type) between 3 and 200),
  object_id text,
  livemode boolean not null,
  api_version text,
  payload_sha256 char(64) not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status public.webhook_event_status not null default 'received',
  delivery_count integer not null default 1 check (delivery_count between 1 and 1000000),
  processing_attempts integer not null default 0 check (processing_attempts between 0 and 100),
  last_error_code text check (last_error_code is null or char_length(last_error_code) between 2 and 120),
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((status = 'processing') = (processing_started_at is not null)),
  check ((status in ('processed', 'ignored')) = (processed_at is not null)),
  check ((status = 'failed') = (last_error_code is not null))
);

create index shop_payment_accounts_status_idx on public.shop_payment_accounts(status, updated_at);
create index payment_attempts_order_status_idx on public.payment_attempts(order_id, status, created_at desc);
create index payment_transfers_shop_status_idx on public.payment_transfers(shop_id, status, created_at desc);
create index stripe_webhook_events_processing_idx on public.stripe_webhook_events(status, received_at);

alter table public.shop_payment_accounts enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payment_transfers enable row level security;
alter table public.stripe_webhook_events enable row level security;

create policy shop_payment_accounts_party_read on public.shop_payment_accounts
  for select to authenticated using (public.is_shop_member(shop_id) or public.is_operator());
create policy payment_attempts_operator_read on public.payment_attempts
  for select to authenticated using (public.is_operator());
create policy payment_transfers_seller_or_operator_read on public.payment_transfers
  for select to authenticated using (public.is_shop_member(shop_id) or public.is_operator());
create policy stripe_webhook_events_operator_read on public.stripe_webhook_events
  for select to authenticated using (public.is_operator());

grant select on public.shop_payment_accounts, public.payment_attempts, public.payment_transfers, public.stripe_webhook_events to authenticated;

create or replace function public.sync_stripe_payment_account(
  requested_shop_id uuid,
  requested_provider_account_id text,
  requested_status text,
  requested_transfers_enabled boolean,
  requested_requirements_due_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_account_id text := nullif(trim(requested_provider_account_id), '');
begin
  if not exists (select 1 from public.shops where id = requested_shop_id) then
    raise exception using errcode = 'P0002', message = 'shop_not_found';
  end if;
  if normalized_account_id is null or normalized_account_id !~ '^acct_[A-Za-z0-9]{8,}$' then
    raise exception using errcode = '22023', message = 'invalid_stripe_account_id';
  end if;
  if requested_status not in ('onboarding', 'restricted', 'enabled', 'disabled') then
    raise exception using errcode = '22023', message = 'invalid_payment_account_status';
  end if;
  if requested_transfers_enabled is null
    or requested_requirements_due_count is null
    or requested_requirements_due_count not between 0 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_payment_account_state';
  end if;
  if requested_status = 'enabled' and not requested_transfers_enabled then
    raise exception using errcode = '22023', message = 'enabled_account_requires_transfers';
  end if;

  insert into public.shop_payment_accounts (
    shop_id,
    provider_account_id,
    status,
    transfers_enabled,
    requirements_due_count,
    connected_at,
    last_synced_at
  ) values (
    requested_shop_id,
    normalized_account_id,
    requested_status::public.connected_payment_account_status,
    requested_transfers_enabled,
    requested_requirements_due_count,
    now(),
    now()
  )
  on conflict (shop_id) do update
  set provider_account_id = excluded.provider_account_id,
      status = excluded.status,
      transfers_enabled = excluded.transfers_enabled,
      requirements_due_count = excluded.requirements_due_count,
      last_synced_at = now(),
      updated_at = now();
end;
$$;

create or replace function public.create_payment_attempt(
  requested_order_id uuid,
  requested_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_key text := nullif(trim(requested_idempotency_key), '');
  target_order public.orders;
  existing_attempt public.payment_attempts;
  created_attempt_id uuid;
  next_attempt_number smallint;
begin
  if normalized_key is null
    or char_length(normalized_key) not between 20 and 200
    or normalized_key !~ '^[A-Za-z0-9:_-]+$' then
    raise exception using errcode = '22023', message = 'invalid_payment_idempotency_key';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('payment-order:' || requested_order_id::text, 0)
  );

  select * into existing_attempt
  from public.payment_attempts
  where idempotency_key = normalized_key;

  if found then
    if existing_attempt.order_id <> requested_order_id then
      raise exception using errcode = '23505', message = 'payment_idempotency_key_reused';
    end if;
    return existing_attempt.id;
  end if;

  select * into target_order
  from public.orders
  where id = requested_order_id
  for update;

  if not found
    or target_order.status <> 'pending_payment'
    or target_order.expires_at <= now()
    or target_order.total_cents <= 0 then
    raise exception using errcode = '55000', message = 'order_not_payable';
  end if;

  if not exists (
    select 1 from public.inventory_reservations
    where order_id = requested_order_id and status = 'active' and expires_at > now()
  ) or exists (
    select 1 from public.inventory_reservations
    where order_id = requested_order_id and (status <> 'active' or expires_at <= now())
  ) then
    raise exception using errcode = '55000', message = 'active_reservations_required';
  end if;

  if exists (
    select 1 from public.payment_attempts
    where order_id = requested_order_id
      and status in ('requires_payment_method', 'requires_action', 'processing', 'succeeded')
  ) then
    raise exception using errcode = '55000', message = 'active_payment_attempt_exists';
  end if;

  select coalesce(max(attempt_number), 0) + 1
  into next_attempt_number
  from public.payment_attempts
  where order_id = requested_order_id;

  if next_attempt_number > 100 then
    raise exception using errcode = '54000', message = 'payment_attempt_limit_reached';
  end if;

  insert into public.payment_attempts (
    order_id,
    attempt_number,
    idempotency_key,
    status,
    amount_cents,
    currency
  ) values (
    requested_order_id,
    next_attempt_number,
    normalized_key,
    'requires_payment_method',
    target_order.total_cents,
    target_order.currency
  )
  returning id into created_attempt_id;

  return created_attempt_id;
end;
$$;

create or replace function public.attach_stripe_payment_intent(
  requested_payment_attempt_id uuid,
  requested_provider_payment_intent_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_payment_intent_id text := nullif(trim(requested_provider_payment_intent_id), '');
  target_attempt public.payment_attempts;
begin
  if normalized_payment_intent_id is null or normalized_payment_intent_id !~ '^pi_[A-Za-z0-9]{8,}$' then
    raise exception using errcode = '22023', message = 'invalid_stripe_payment_intent_id';
  end if;

  select * into target_attempt
  from public.payment_attempts
  where id = requested_payment_attempt_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'payment_attempt_not_found';
  end if;
  if target_attempt.status not in ('requires_payment_method', 'requires_action') then
    raise exception using errcode = '55000', message = 'payment_attempt_not_attachable';
  end if;
  if target_attempt.provider_payment_intent_id is not null
    and target_attempt.provider_payment_intent_id <> normalized_payment_intent_id then
    raise exception using errcode = '55000', message = 'payment_intent_already_attached';
  end if;

  update public.payment_attempts
  set provider_payment_intent_id = normalized_payment_intent_id,
      updated_at = now()
  where id = requested_payment_attempt_id;
end;
$$;

create or replace function public.register_stripe_webhook_event(
  requested_provider_event_id text,
  requested_event_type text,
  requested_object_id text,
  requested_livemode boolean,
  requested_api_version text,
  requested_payload_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_event_id text := nullif(trim(requested_provider_event_id), '');
  normalized_event_type text := nullif(trim(requested_event_type), '');
  normalized_object_id text := nullif(trim(requested_object_id), '');
  normalized_api_version text := nullif(trim(requested_api_version), '');
  normalized_payload_sha256 text := lower(nullif(trim(requested_payload_sha256), ''));
begin
  if normalized_event_id is null or normalized_event_id !~ '^evt_[A-Za-z0-9]{8,}$' then
    raise exception using errcode = '22023', message = 'invalid_stripe_event_id';
  end if;
  if normalized_event_type is null or char_length(normalized_event_type) not between 3 and 200 then
    raise exception using errcode = '22023', message = 'invalid_stripe_event_type';
  end if;
  if requested_livemode is null then
    raise exception using errcode = '22023', message = 'stripe_livemode_required';
  end if;
  if normalized_payload_sha256 is null or normalized_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_stripe_payload_hash';
  end if;

  insert into public.stripe_webhook_events (
    provider_event_id,
    event_type,
    object_id,
    livemode,
    api_version,
    payload_sha256
  ) values (
    normalized_event_id,
    normalized_event_type,
    normalized_object_id,
    requested_livemode,
    normalized_api_version,
    normalized_payload_sha256
  )
  on conflict (provider_event_id) do nothing;

  if found then
    return true;
  end if;

  if exists (
    select 1 from public.stripe_webhook_events
    where provider_event_id = normalized_event_id
      and (
        event_type <> normalized_event_type
        or livemode is distinct from requested_livemode
        or payload_sha256 <> normalized_payload_sha256
      )
  ) then
    raise exception using errcode = '23514', message = 'stripe_event_identity_conflict';
  end if;

  update public.stripe_webhook_events
  set delivery_count = delivery_count + 1,
      updated_at = now()
  where provider_event_id = normalized_event_id;

  return false;
end;
$$;

create or replace function public.claim_stripe_webhook_event(requested_provider_event_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.stripe_webhook_events
  set status = 'processing',
      processing_attempts = processing_attempts + 1,
      processing_started_at = now(),
      processed_at = null,
      last_error_code = null,
      updated_at = now()
  where provider_event_id = requested_provider_event_id
    and status in ('received', 'failed')
    and processing_attempts < 10;

  return found;
end;
$$;

create or replace function public.complete_stripe_webhook_event(
  requested_provider_event_id text,
  requested_outcome text,
  requested_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_error_code text := nullif(trim(requested_error_code), '');
begin
  if requested_outcome not in ('processed', 'ignored', 'failed') then
    raise exception using errcode = '22023', message = 'invalid_webhook_outcome';
  end if;
  if requested_outcome = 'failed'
    and (normalized_error_code is null or char_length(normalized_error_code) not between 2 and 120) then
    raise exception using errcode = '22023', message = 'webhook_error_code_required';
  end if;

  update public.stripe_webhook_events
  set status = requested_outcome::public.webhook_event_status,
      processing_started_at = null,
      processed_at = case when requested_outcome in ('processed', 'ignored') then now() else null end,
      last_error_code = case when requested_outcome = 'failed' then normalized_error_code else null end,
      updated_at = now()
  where provider_event_id = requested_provider_event_id and status = 'processing';

  if not found then
    raise exception using errcode = '55000', message = 'webhook_event_not_processing';
  end if;
end;
$$;

revoke all on function public.sync_stripe_payment_account(uuid, text, text, boolean, integer) from public;
revoke all on function public.create_payment_attempt(uuid, text) from public;
revoke all on function public.attach_stripe_payment_intent(uuid, text) from public;
revoke all on function public.register_stripe_webhook_event(text, text, text, boolean, text, text) from public;
revoke all on function public.claim_stripe_webhook_event(text) from public;
revoke all on function public.complete_stripe_webhook_event(text, text, text) from public;

grant execute on function public.sync_stripe_payment_account(uuid, text, text, boolean, integer) to service_role;
grant execute on function public.create_payment_attempt(uuid, text) to service_role;
grant execute on function public.attach_stripe_payment_intent(uuid, text) to service_role;
grant execute on function public.register_stripe_webhook_event(text, text, text, boolean, text, text) to service_role;
grant execute on function public.claim_stripe_webhook_event(text) to service_role;
grant execute on function public.complete_stripe_webhook_event(text, text, text) to service_role;
