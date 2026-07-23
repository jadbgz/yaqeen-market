-- Redis protects HTTP/provider capacity before work starts. These private,
-- transactional counters protect successful domain consumption even when a
-- client calls an exposed RPC directly through PostgREST.

create schema if not exists private;
revoke all on schema private from public;

create table private.usage_buckets (
  policy text not null check (char_length(policy) between 3 and 80),
  subject_hash bytea not null,
  bucket_start date not null,
  units bigint not null check (units >= 0),
  updated_at timestamptz not null default now(),
  primary key (policy, subject_hash, bucket_start)
);

revoke all on table private.usage_buckets from public;

create or replace function private.consume_daily_quota(
  requested_policy text,
  requested_subject uuid,
  requested_units bigint,
  configured_limit bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_policy text := nullif(trim(requested_policy), '');
  hashed_subject bytea;
begin
  if normalized_policy is null
    or char_length(normalized_policy) not between 3 and 80
    or requested_subject is null
    or requested_units <= 0
    or configured_limit <= 0
    or requested_units > configured_limit then
    raise exception using errcode = '22023', message = 'invalid_domain_quota';
  end if;

  hashed_subject := extensions.digest(
    convert_to(requested_subject::text, 'UTF8'),
    'sha256'
  );

  insert into private.usage_buckets (
    policy,
    subject_hash,
    bucket_start,
    units
  ) values (
    normalized_policy,
    hashed_subject,
    (now() at time zone 'UTC')::date,
    requested_units
  )
  on conflict (policy, subject_hash, bucket_start)
  do update
  set units = private.usage_buckets.units + excluded.units,
      updated_at = now()
  where private.usage_buckets.units + excluded.units <= configured_limit;

  if not found then
    raise exception using errcode = '54000', message = 'domain_quota_exceeded';
  end if;
end;
$$;

revoke all on function private.consume_daily_quota(text, uuid, bigint, bigint)
  from public;

create or replace function private.enforce_order_creation_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.consume_daily_quota(
    'customer_orders_created',
    new.customer_id,
    1,
    20
  );
  return new;
end;
$$;

create or replace function private.enforce_reserved_unit_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_customer_id uuid;
begin
  select o.customer_id
  into target_customer_id
  from public.shop_orders so
  join public.orders o on o.id = so.order_id
  where so.id = new.shop_order_id;

  if target_customer_id is null then
    raise exception using errcode = '23503', message = 'quota_order_owner_not_found';
  end if;

  perform private.consume_daily_quota(
    'customer_units_reserved',
    target_customer_id,
    new.quantity,
    200
  );
  return new;
end;
$$;

revoke all on function private.enforce_order_creation_quota() from public;
revoke all on function private.enforce_reserved_unit_quota() from public;

create trigger orders_daily_domain_quota
before insert on public.orders
for each row execute function private.enforce_order_creation_quota();

create trigger order_items_daily_unit_quota
before insert on public.order_items
for each row execute function private.enforce_reserved_unit_quota();

comment on table private.usage_buckets is
  'Non-exposed transactional counters for successful domain consumption.';
comment on function private.consume_daily_quota(text, uuid, bigint, bigint) is
  'Atomic UTC-day quota primitive; limits are supplied only by private trigger wrappers.';
