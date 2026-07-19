create extension if not exists pgcrypto;

create type public.user_role as enum ('customer', 'seller', 'operator', 'admin');
create type public.shop_status as enum ('draft', 'under_review', 'approved', 'suspended', 'rejected');
create type public.product_status as enum ('draft', 'under_review', 'published', 'rejected', 'archived');
create type public.evidence_kind as enum ('seller_declaration', 'documentary_review', 'third_party_certificate', 'laboratory_analysis');
create type public.evidence_status as enum ('pending', 'approved', 'rejected', 'expired', 'revoked');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'customer',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  slug text not null unique check (slug = lower(slug)),
  name text not null check (char_length(name) between 2 and 120),
  description text,
  status public.shop_status not null default 'draft',
  ships_from_country char(2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shop_members (
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null check (member_role in ('owner', 'manager', 'catalog', 'fulfillment')),
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  slug text not null check (slug = lower(slug)),
  title text not null check (char_length(title) between 2 and 180),
  description text,
  category text not null,
  status public.product_status not null default 'draft',
  verification_summary text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, slug)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  title text not null,
  price_cents integer not null check (price_cents >= 0),
  currency char(3) not null default 'EUR',
  stock_on_hand integer not null default 0 check (stock_on_hand >= 0),
  stock_reserved integer not null default 0 check (stock_reserved >= 0 and stock_reserved <= stock_on_hand),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_evidence (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  kind public.evidence_kind not null,
  status public.evidence_status not null default 'pending',
  issuer_name text,
  reference_number text,
  scope text not null,
  valid_from date,
  valid_until date,
  document_path text,
  public_summary text,
  submitted_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check ((status in ('approved', 'rejected')) = (reviewed_by is not null and reviewed_at is not null))
);

create index products_shop_status_idx on public.products(shop_id, status);
create index variants_product_active_idx on public.product_variants(product_id, active);
create index evidence_product_status_idx on public.product_evidence(product_id, status);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (new.id, 'customer', coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_shop_member(target_shop_id uuid)
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
    where shop_id = target_shop_id and user_id = (select auth.uid())
  );
$$;

alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_evidence enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_self_update on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy shops_public_read on public.shops for select to anon, authenticated using (status = 'approved' or public.is_shop_member(id));
create policy shops_owner_insert on public.shops for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy shops_member_update on public.shops for update to authenticated using (public.is_shop_member(id)) with check (public.is_shop_member(id));

create policy shop_members_member_read on public.shop_members for select to authenticated using (public.is_shop_member(shop_id));
create policy shop_members_owner_insert on public.shop_members for insert to authenticated with check (
  exists (select 1 from public.shops where id = shop_id and owner_id = (select auth.uid()))
);

create policy products_public_read on public.products for select to anon, authenticated using (status = 'published' or public.is_shop_member(shop_id));
create policy products_member_write on public.products for all to authenticated using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));

create policy variants_public_read on public.product_variants for select to anon, authenticated using (
  exists (select 1 from public.products where id = product_id and status = 'published')
  or exists (select 1 from public.products where id = product_id and public.is_shop_member(shop_id))
);
create policy variants_member_write on public.product_variants for all to authenticated using (
  exists (select 1 from public.products where id = product_id and public.is_shop_member(shop_id))
) with check (
  exists (select 1 from public.products where id = product_id and public.is_shop_member(shop_id))
);

create policy evidence_public_read on public.product_evidence for select to anon, authenticated using (
  (status = 'approved' and public_summary is not null and exists (select 1 from public.products where id = product_id and status = 'published'))
  or exists (select 1 from public.products where id = product_id and public.is_shop_member(shop_id))
);
create policy evidence_member_submit on public.product_evidence for insert to authenticated with check (
  submitted_by = (select auth.uid())
  and exists (select 1 from public.products where id = product_id and public.is_shop_member(shop_id))
);

grant select on public.shops, public.products, public.product_variants, public.product_evidence to anon;
grant select on public.profiles, public.shops, public.shop_members, public.products, public.product_variants, public.product_evidence to authenticated;
grant update (display_name, updated_at) on public.profiles to authenticated;
grant insert on public.shops to authenticated;
grant update (name, description, ships_from_country, updated_at) on public.shops to authenticated;
grant insert on public.shop_members to authenticated;
grant insert, delete on public.products to authenticated;
grant update (slug, title, description, category, updated_at) on public.products to authenticated;
grant insert, update, delete on public.product_variants to authenticated;
grant insert on public.product_evidence to authenticated;
