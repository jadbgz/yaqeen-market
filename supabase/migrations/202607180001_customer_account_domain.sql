create type public.account_deletion_status as enum ('pending', 'cancelled', 'completed');

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 40),
  recipient_name text not null check (char_length(recipient_name) between 2 and 120),
  line1 text not null check (char_length(line1) between 3 and 180),
  line2 text check (line2 is null or char_length(line2) between 2 and 180),
  postal_code text not null check (char_length(postal_code) between 2 and 20),
  city text not null check (char_length(city) between 2 and 100),
  country_code char(2) not null check (country_code = upper(country_code)),
  phone text check (phone is null or char_length(phone) between 6 and 32),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index customer_addresses_one_default_idx
  on public.customer_addresses(customer_id) where is_default;
create index customer_addresses_customer_idx
  on public.customer_addresses(customer_id, created_at);

create table public.order_shipping_addresses (
  order_id uuid primary key references public.orders(id) on delete restrict,
  source_address_id uuid not null,
  recipient_name text not null check (char_length(recipient_name) between 2 and 120),
  line1 text not null check (char_length(line1) between 3 and 180),
  line2 text check (line2 is null or char_length(line2) between 2 and 180),
  postal_code text not null check (char_length(postal_code) between 2 and 20),
  city text not null check (char_length(city) between 2 and 100),
  country_code char(2) not null check (country_code = upper(country_code)),
  phone text check (phone is null or char_length(phone) between 6 and 32),
  captured_at timestamptz not null default now()
);

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id) on delete set null,
  status public.account_deletion_status not null default 'pending',
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null default (now() + interval '30 days'),
  cancelled_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (customer_id, requested_at),
  check (status = 'completed' or customer_id is not null),
  check (scheduled_for >= requested_at + interval '30 days'),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check ((status = 'completed') = (completed_at is not null))
);

create unique index account_deletion_one_pending_idx
  on public.account_deletion_requests(customer_id) where status = 'pending';
create index account_deletion_schedule_idx
  on public.account_deletion_requests(scheduled_for) where status = 'pending';

alter table public.customer_addresses enable row level security;
alter table public.order_shipping_addresses enable row level security;
alter table public.account_deletion_requests enable row level security;

create policy customer_addresses_owner_read on public.customer_addresses
  for select to authenticated using (customer_id = (select auth.uid()));

create policy order_shipping_addresses_party_read on public.order_shipping_addresses
  for select to authenticated using (
    public.can_read_order(order_id)
    or exists (
      select 1 from public.shop_orders so
      where so.order_id = order_shipping_addresses.order_id
        and public.is_shop_member(so.shop_id)
    )
  );

create policy account_deletion_owner_or_operator_read on public.account_deletion_requests
  for select to authenticated using (
    customer_id = (select auth.uid()) or public.is_operator()
  );

grant select on public.customer_addresses, public.order_shipping_addresses,
  public.account_deletion_requests to authenticated;

create or replace function public.save_customer_address(
  requested_address_id uuid,
  requested_label text,
  requested_recipient_name text,
  requested_line1 text,
  requested_line2 text,
  requested_postal_code text,
  requested_city text,
  requested_country_code text,
  requested_phone text,
  requested_is_default boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  saved_id uuid;
  make_default boolean;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  requested_label := btrim(requested_label);
  requested_recipient_name := btrim(requested_recipient_name);
  requested_line1 := btrim(requested_line1);
  requested_line2 := nullif(btrim(requested_line2), '');
  requested_postal_code := btrim(requested_postal_code);
  requested_city := btrim(requested_city);
  requested_country_code := upper(btrim(requested_country_code));
  requested_phone := nullif(btrim(requested_phone), '');

  if requested_label is null or requested_recipient_name is null
    or requested_line1 is null or requested_postal_code is null
    or requested_city is null or requested_country_code is null
    or char_length(requested_label) not between 2 and 40
    or char_length(requested_recipient_name) not between 2 and 120
    or char_length(requested_line1) not between 3 and 180
    or (requested_line2 is not null and char_length(requested_line2) not between 2 and 180)
    or char_length(requested_postal_code) not between 2 and 20
    or char_length(requested_city) not between 2 and 100
    or requested_country_code !~ '^[A-Z]{2}$'
    or (requested_phone is not null and char_length(requested_phone) not between 6 and 32) then
    raise exception using errcode = '22023', message = 'invalid_address';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer-address:' || current_user_id::text, 0)
  );

  make_default := coalesce(requested_is_default, false)
    or not exists (select 1 from public.customer_addresses where customer_id = current_user_id);

  if requested_address_id is null then
    if (select count(*) from public.customer_addresses where customer_id = current_user_id) >= 10 then
      raise exception using errcode = '54000', message = 'address_limit_reached';
    end if;
    saved_id := gen_random_uuid();
  else
    select id into saved_id from public.customer_addresses
      where id = requested_address_id and customer_id = current_user_id for update;
    if not found then
      raise exception using errcode = '42501', message = 'address_ownership_required';
    end if;
  end if;

  if make_default then
    update public.customer_addresses set is_default = false, updated_at = now()
      where customer_id = current_user_id and is_default;
  end if;

  insert into public.customer_addresses (
    id, customer_id, label, recipient_name, line1, line2, postal_code,
    city, country_code, phone, is_default
  ) values (
    saved_id, current_user_id, requested_label, requested_recipient_name,
    requested_line1, requested_line2, requested_postal_code, requested_city,
    requested_country_code, requested_phone, make_default
  )
  on conflict (id) do update set
    label = excluded.label, recipient_name = excluded.recipient_name,
    line1 = excluded.line1, line2 = excluded.line2,
    postal_code = excluded.postal_code, city = excluded.city,
    country_code = excluded.country_code, phone = excluded.phone,
    is_default = case when make_default then true else public.customer_addresses.is_default end,
    updated_at = now();

  return saved_id;
end;
$$;

create or replace function public.delete_customer_address(requested_address_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  deleted_default boolean;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer-address:' || current_user_id::text, 0)
  );
  delete from public.customer_addresses
    where id = requested_address_id and customer_id = current_user_id
    returning is_default into deleted_default;
  if not found then
    raise exception using errcode = '42501', message = 'address_ownership_required';
  end if;
  if deleted_default then
    update public.customer_addresses set is_default = true, updated_at = now()
      where id = (
        select id from public.customer_addresses
        where customer_id = current_user_id order by created_at, id limit 1
      );
  end if;
end;
$$;

create or replace function public.create_order_reservation_with_address(
  requested_items jsonb,
  requested_checkout_token uuid,
  requested_address_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  created_order_id uuid;
  target_address record;
  existing_snapshot record;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  created_order_id := public.create_order_reservation(requested_items, requested_checkout_token);
  select * into existing_snapshot from public.order_shipping_addresses
    where order_id = created_order_id;
  if found then
    if existing_snapshot.source_address_id <> requested_address_id then
      raise exception using errcode = '22023', message = 'checkout_address_conflict';
    end if;
    return created_order_id;
  end if;

  select * into target_address from public.customer_addresses
    where id = requested_address_id and customer_id = current_user_id;
  if not found then
    raise exception using errcode = '42501', message = 'address_ownership_required';
  end if;

  insert into public.order_shipping_addresses (
    order_id, source_address_id, recipient_name, line1, line2, postal_code, city, country_code, phone
  ) values (
    created_order_id, requested_address_id, target_address.recipient_name, target_address.line1,
    target_address.line2, target_address.postal_code, target_address.city,
    target_address.country_code, target_address.phone
  );
  return created_order_id;
end;
$$;

create or replace function public.request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_date timestamptz;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('account-deletion:' || current_user_id::text, 0)
  );
  select scheduled_for into target_date from public.account_deletion_requests
    where customer_id = current_user_id and status = 'pending';
  if found then return target_date; end if;
  target_date := now() + interval '30 days';
  insert into public.account_deletion_requests(customer_id, scheduled_for)
    values (current_user_id, target_date);
  return target_date;
end;
$$;

create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  update public.account_deletion_requests
    set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where customer_id = current_user_id and status = 'pending';
  if not found then
    raise exception using errcode = '55000', message = 'no_pending_deletion_request';
  end if;
end;
$$;

revoke all on function public.save_customer_address(uuid,text,text,text,text,text,text,text,text,boolean) from public;
revoke all on function public.delete_customer_address(uuid) from public;
revoke all on function public.create_order_reservation_with_address(jsonb,uuid,uuid) from public;
revoke all on function public.request_account_deletion() from public;
revoke all on function public.cancel_account_deletion() from public;
revoke execute on function public.create_order_reservation(jsonb, uuid) from authenticated;

grant execute on function public.save_customer_address(uuid,text,text,text,text,text,text,text,text,boolean) to authenticated;
grant execute on function public.delete_customer_address(uuid) to authenticated;
grant execute on function public.create_order_reservation_with_address(jsonb,uuid,uuid) to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;

comment on table public.order_shipping_addresses is
  'Immutable delivery snapshot captured when an order reservation is created.';
comment on table public.account_deletion_requests is
  'Audited cooling-off queue. A trusted retention-aware worker must perform final Auth deletion.';
