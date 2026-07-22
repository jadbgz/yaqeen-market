-- Published products remain sellable while a seller prepares a complete,
-- isolated revision. Only an operator can atomically promote that snapshot.

create type public.product_revision_status as enum (
  'draft',
  'under_review',
  'approved',
  'rejected',
  'withdrawn'
);

create table public.product_revisions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  status public.product_revision_status not null default 'draft',
  title text not null check (char_length(title) between 2 and 180),
  slug text not null check (slug = lower(slug)),
  description text not null check (char_length(description) between 40 and 5000),
  category text not null,
  base_product_updated_at timestamptz not null,
  created_by uuid not null references public.profiles(id),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, revision_number),
  constraint product_revision_state_check check (
    (
      status = 'draft'
      and submitted_at is null
      and reviewed_by is null
      and reviewed_at is null
      and review_rationale is null
    )
    or (
      status = 'under_review'
      and submitted_at is not null
      and reviewed_by is null
      and reviewed_at is null
      and review_rationale is null
    )
    or (
      status in ('approved', 'rejected')
      and submitted_at is not null
      and reviewed_by is not null
      and reviewed_at is not null
      and review_rationale is not null
    )
    or (
      status = 'withdrawn'
      and submitted_at is null
      and reviewed_by is null
      and reviewed_at is null
      and review_rationale is null
    )
  )
);

create table public.product_revision_variants (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.product_revisions(id) on delete cascade,
  source_variant_id uuid references public.product_variants(id) on delete restrict,
  sku text not null check (char_length(sku) between 3 and 64),
  title text not null check (char_length(title) between 2 and 120),
  price_cents integer not null check (price_cents between 1 and 10000000),
  currency char(3) not null default 'EUR' check (currency = 'EUR'),
  stock_on_hand integer not null check (stock_on_hand between 0 and 1000000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (revision_id, source_variant_id)
);

create unique index product_revisions_one_active_idx
  on public.product_revisions(product_id)
  where status in ('draft', 'under_review', 'rejected');
create index product_revisions_review_queue_idx
  on public.product_revisions(status, submitted_at)
  where status = 'under_review';
create index product_revision_variants_revision_idx
  on public.product_revision_variants(revision_id, active);
create index product_revision_variants_sku_idx
  on public.product_revision_variants(revision_id, sku);

alter table public.product_revisions enable row level security;
alter table public.product_revision_variants enable row level security;

create or replace function public.can_read_product_revision(requested_revision_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.product_revisions revision
    join public.products product on product.id = revision.product_id
    where revision.id = requested_revision_id
      and public.is_shop_member(product.shop_id)
  ) or public.is_operator();
$$;

revoke all on function public.can_read_product_revision(uuid) from public;
grant execute on function public.can_read_product_revision(uuid) to authenticated;

create policy product_revisions_authorized_read on public.product_revisions
  for select to authenticated using (public.can_read_product_revision(id));
create policy product_revision_variants_authorized_read on public.product_revision_variants
  for select to authenticated using (public.can_read_product_revision(revision_id));

revoke all on table public.product_revisions from anon, authenticated;
revoke all on table public.product_revision_variants from anon, authenticated;
grant select on table public.product_revisions to authenticated;
grant select on table public.product_revision_variants to authenticated;

create or replace function public.start_product_revision(requested_product_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_product public.products;
  existing_revision_id uuid;
  created_revision_id uuid;
  next_revision_number integer;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select product.* into target_product
  from public.products product
  where product.id = requested_product_id
  for update;

  if not found or not public.is_shop_member(target_product.shop_id) then
    raise exception using errcode = '42501', message = 'product_ownership_required';
  end if;
  if target_product.status <> 'published' then
    raise exception using errcode = '55000', message = 'published_product_required';
  end if;
  if target_product.description is null or char_length(trim(target_product.description)) < 40 then
    raise exception using errcode = '23514', message = 'published_product_description_incomplete';
  end if;

  select revision.id into existing_revision_id
  from public.product_revisions revision
  where revision.product_id = requested_product_id
    and revision.status in ('draft', 'under_review', 'rejected')
  order by revision.revision_number desc
  limit 1;
  if existing_revision_id is not null then return existing_revision_id; end if;

  select coalesce(max(revision.revision_number), 0) + 1 into next_revision_number
  from public.product_revisions revision
  where revision.product_id = requested_product_id;

  insert into public.product_revisions (
    product_id, revision_number, status, title, slug, description, category,
    base_product_updated_at, created_by
  ) values (
    target_product.id, next_revision_number, 'draft', target_product.title,
    target_product.slug, target_product.description, target_product.category,
    target_product.updated_at, current_user_id
  ) returning id into created_revision_id;

  insert into public.product_revision_variants (
    revision_id, source_variant_id, sku, title, price_cents, currency,
    stock_on_hand, active
  )
  select created_revision_id, variant.id, variant.sku, variant.title,
    variant.price_cents, variant.currency, variant.stock_on_hand, variant.active
  from public.product_variants variant
  where variant.product_id = requested_product_id
  order by variant.created_at;

  return created_revision_id;
end;
$$;

create or replace function public.update_product_revision(
  requested_revision_id uuid,
  requested_title text,
  requested_slug text,
  requested_description text,
  requested_category text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_revision public.product_revisions;
  target_product public.products;
  normalized_title text := nullif(trim(requested_title), '');
  normalized_slug text := lower(nullif(trim(requested_slug), ''));
  normalized_description text := nullif(trim(requested_description), '');
  normalized_category text := lower(nullif(trim(requested_category), ''));
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select revision.* into target_revision from public.product_revisions revision where revision.id = requested_revision_id for update;
  if not found then raise exception using errcode = '42501', message = 'revision_ownership_required'; end if;
  select product.* into target_product from public.products product where product.id = target_revision.product_id for update;
  if not public.is_shop_member(target_product.shop_id) then raise exception using errcode = '42501', message = 'revision_ownership_required'; end if;
  if target_revision.status not in ('draft', 'rejected') then raise exception using errcode = '55000', message = 'revision_content_locked'; end if;
  if target_product.status <> 'published' then raise exception using errcode = '55000', message = 'published_product_required'; end if;
  if normalized_title is null or char_length(normalized_title) not between 2 and 180 then raise exception using errcode = '22023', message = 'invalid_product_title'; end if;
  if normalized_slug is null or char_length(normalized_slug) not between 3 and 100 or normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception using errcode = '22023', message = 'invalid_product_slug'; end if;
  if normalized_description is null or char_length(normalized_description) not between 40 and 5000 then raise exception using errcode = '22023', message = 'invalid_product_description'; end if;
  if normalized_category is null or normalized_category <> all(array['parfums', 'cosmetiques', 'livres', 'mode', 'bien-etre', 'complements', 'maison']) then raise exception using errcode = '22023', message = 'invalid_product_category'; end if;

  update public.product_revisions set
    title = normalized_title,
    slug = normalized_slug,
    description = normalized_description,
    category = normalized_category,
    status = 'draft',
    base_product_updated_at = case
      when target_revision.status = 'rejected' then target_product.updated_at
      else target_revision.base_product_updated_at
    end,
    submitted_at = null,
    reviewed_by = null,
    reviewed_at = null,
    review_rationale = null,
    updated_at = now()
  where id = requested_revision_id;
end;
$$;

create or replace function public.save_product_revision_variant(
  requested_revision_id uuid,
  requested_revision_variant_id uuid,
  requested_title text,
  requested_sku text,
  requested_price_cents integer,
  requested_stock_on_hand integer,
  requested_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_revision public.product_revisions;
  target_product public.products;
  target_revision_variant public.product_revision_variants;
  normalized_title text := nullif(trim(requested_title), '');
  normalized_sku text := upper(nullif(trim(requested_sku), ''));
  saved_variant_id uuid;
  reserved_stock integer := 0;
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select revision.* into target_revision from public.product_revisions revision where revision.id = requested_revision_id for update;
  if not found then raise exception using errcode = '42501', message = 'revision_ownership_required'; end if;
  select product.* into target_product from public.products product where product.id = target_revision.product_id for update;
  if not public.is_shop_member(target_product.shop_id) then raise exception using errcode = '42501', message = 'revision_ownership_required'; end if;
  if target_revision.status not in ('draft', 'rejected') then raise exception using errcode = '55000', message = 'revision_variants_locked'; end if;
  if target_product.status <> 'published' then raise exception using errcode = '55000', message = 'published_product_required'; end if;
  if normalized_title is null or char_length(normalized_title) not between 2 and 120 then raise exception using errcode = '22023', message = 'invalid_variant_title'; end if;
  if normalized_sku is null or char_length(normalized_sku) not between 3 and 64 or normalized_sku !~ '^[A-Z0-9][A-Z0-9._-]+$' then raise exception using errcode = '22023', message = 'invalid_sku'; end if;
  if requested_price_cents is null or requested_price_cents not between 1 and 10000000 then raise exception using errcode = '22023', message = 'invalid_price'; end if;
  if requested_stock_on_hand is null or requested_stock_on_hand not between 0 and 1000000 then raise exception using errcode = '22023', message = 'invalid_stock'; end if;

  if requested_revision_variant_id is null then
    insert into public.product_revision_variants (
      revision_id, source_variant_id, sku, title, price_cents, currency,
      stock_on_hand, active
    ) values (
      requested_revision_id, null, normalized_sku, normalized_title,
      requested_price_cents, 'EUR', requested_stock_on_hand,
      coalesce(requested_active, true)
    ) returning id into saved_variant_id;
  else
    select revision_variant.* into target_revision_variant
    from public.product_revision_variants revision_variant
    where revision_variant.id = requested_revision_variant_id
      and revision_variant.revision_id = requested_revision_id
    for update;
    if not found then raise exception using errcode = '42501', message = 'revision_variant_ownership_required'; end if;
    if target_revision_variant.source_variant_id is not null then
      select variant.stock_reserved into reserved_stock
      from public.product_variants variant
      where variant.id = target_revision_variant.source_variant_id
        and variant.product_id = target_product.id;
      if not found then raise exception using errcode = '55000', message = 'source_variant_missing'; end if;
      if requested_stock_on_hand <> target_revision_variant.stock_on_hand then
        raise exception using errcode = '55000', message = 'published_inventory_is_managed_live';
      end if;
    end if;
    if requested_stock_on_hand < reserved_stock then raise exception using errcode = '22023', message = 'stock_below_reserved'; end if;
    update public.product_revision_variants set
      sku = normalized_sku,
      title = normalized_title,
      price_cents = requested_price_cents,
      stock_on_hand = requested_stock_on_hand,
      active = coalesce(requested_active, true),
      updated_at = now()
    where id = requested_revision_variant_id
    returning id into saved_variant_id;
  end if;

  update public.product_revisions set
    status = 'draft',
    base_product_updated_at = case
      when target_revision.status = 'rejected' then target_product.updated_at
      else target_revision.base_product_updated_at
    end,
    submitted_at = null,
    reviewed_by = null,
    reviewed_at = null,
    review_rationale = null,
    updated_at = now()
  where id = requested_revision_id;
  return saved_variant_id;
end;
$$;

create or replace function public.set_published_variant_inventory(
  requested_variant_id uuid,
  requested_stock_on_hand integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_variant public.product_variants;
  target_shop_id uuid;
  target_product_status public.product_status;
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if requested_stock_on_hand is null or requested_stock_on_hand not between 0 and 1000000 then raise exception using errcode = '22023', message = 'invalid_stock'; end if;

  select variant, product.shop_id, product.status
  into target_variant, target_shop_id, target_product_status
  from public.product_variants variant
  join public.products product on product.id = variant.product_id
  where variant.id = requested_variant_id
  for update of variant, product;

  if not found or not public.is_shop_member(target_shop_id) then
    raise exception using errcode = '42501', message = 'variant_ownership_required';
  end if;
  if target_product_status <> 'published' then raise exception using errcode = '55000', message = 'published_product_required'; end if;
  if requested_stock_on_hand < target_variant.stock_reserved then raise exception using errcode = '22023', message = 'stock_below_reserved'; end if;

  update public.product_variants set
    stock_on_hand = requested_stock_on_hand,
    updated_at = now()
  where id = requested_variant_id;
end;
$$;

create or replace function public.submit_product_revision(requested_revision_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_revision public.product_revisions;
  target_product public.products;
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select revision.* into target_revision from public.product_revisions revision where revision.id = requested_revision_id for update;
  if not found then raise exception using errcode = '42501', message = 'revision_ownership_required'; end if;
  select product.* into target_product from public.products product where product.id = target_revision.product_id for update;
  if not public.is_shop_member(target_product.shop_id) then raise exception using errcode = '42501', message = 'revision_ownership_required'; end if;
  if target_revision.status <> 'draft' then raise exception using errcode = '55000', message = 'revision_not_submittable'; end if;
  if target_product.status <> 'published' then raise exception using errcode = '55000', message = 'published_product_required'; end if;
  if target_product.updated_at <> target_revision.base_product_updated_at then raise exception using errcode = '40001', message = 'revision_base_changed'; end if;
  if not exists (select 1 from public.shops where id = target_product.shop_id and status = 'approved') then raise exception using errcode = '55000', message = 'shop_must_be_approved'; end if;
  if not public.has_current_approved_evidence(target_product.id) then raise exception using errcode = '55000', message = 'current_evidence_required'; end if;
  if not exists (select 1 from public.product_revision_variants where revision_id = requested_revision_id and active and price_cents > 0) then raise exception using errcode = '22023', message = 'active_variant_required'; end if;
  if exists (
    select 1 from public.product_revision_variants
    where revision_id = requested_revision_id
    group by sku having count(*) > 1
  ) then raise exception using errcode = '23505', message = 'duplicate_revision_sku'; end if;
  if exists (
    select 1
    from public.product_variants variant
    where variant.product_id = target_product.id
      and not exists (
        select 1 from public.product_revision_variants revision_variant
        where revision_variant.revision_id = requested_revision_id
          and revision_variant.source_variant_id = variant.id
      )
  ) then raise exception using errcode = '55000', message = 'revision_snapshot_incomplete'; end if;

  update public.product_revisions
  set status = 'under_review', submitted_at = now(), updated_at = now()
  where id = requested_revision_id;
end;
$$;

create or replace function public.withdraw_product_revision(requested_revision_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_revision public.product_revisions;
  target_shop_id uuid;
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select revision.* into target_revision from public.product_revisions revision where revision.id = requested_revision_id for update;
  if not found then raise exception using errcode = '42501', message = 'revision_ownership_required'; end if;
  select product.shop_id into target_shop_id from public.products product where product.id = target_revision.product_id;
  if not public.is_shop_member(target_shop_id) then raise exception using errcode = '42501', message = 'revision_ownership_required'; end if;
  if target_revision.status not in ('draft', 'rejected') then raise exception using errcode = '55000', message = 'revision_cannot_be_withdrawn'; end if;
  update public.product_revisions set
    status = 'withdrawn', submitted_at = null, reviewed_by = null,
    reviewed_at = null, review_rationale = null, updated_at = now()
  where id = requested_revision_id;
end;
$$;

alter table public.moderation_decisions drop constraint moderation_decisions_entity_type_check;
alter table public.moderation_decisions add constraint moderation_decisions_entity_type_check
  check (entity_type in ('shop', 'product', 'product_media', 'product_revision'));

create or replace function public.review_product_revision(
  requested_revision_id uuid,
  requested_decision text,
  requested_rationale text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_rationale text := nullif(trim(requested_rationale), '');
  target_revision public.product_revisions;
  target_product public.products;
  revision_variant public.product_revision_variants;
begin
  if current_user_id is null or not public.is_operator() then raise exception using errcode = '42501', message = 'operator_role_required'; end if;
  if requested_decision not in ('approved', 'rejected') then raise exception using errcode = '22023', message = 'invalid_review_decision'; end if;
  if normalized_rationale is null or char_length(normalized_rationale) not between 10 and 2000 then raise exception using errcode = '22023', message = 'invalid_review_rationale'; end if;

  select revision.* into target_revision from public.product_revisions revision where revision.id = requested_revision_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'revision_not_found'; end if;
  if target_revision.status <> 'under_review' then raise exception using errcode = '55000', message = 'revision_not_under_review'; end if;
  select product.* into target_product from public.products product where product.id = target_revision.product_id for update;

  if requested_decision = 'approved' then
    if target_product.status <> 'published' then raise exception using errcode = '55000', message = 'published_product_required'; end if;
    if target_product.updated_at <> target_revision.base_product_updated_at then raise exception using errcode = '40001', message = 'revision_base_changed'; end if;
    if not exists (select 1 from public.shops where id = target_product.shop_id and status = 'approved') then raise exception using errcode = '55000', message = 'shop_must_be_approved'; end if;
    if not public.has_current_approved_evidence(target_product.id) then raise exception using errcode = '55000', message = 'current_evidence_required'; end if;
    if not exists (select 1 from public.product_revision_variants where revision_id = requested_revision_id and active and price_cents > 0) then raise exception using errcode = '22023', message = 'active_variant_required'; end if;
    if exists (
      select 1 from public.product_revision_variants
      where revision_id = requested_revision_id
      group by sku having count(*) > 1
    ) then raise exception using errcode = '23505', message = 'duplicate_revision_sku'; end if;
    if exists (
      select 1
      from public.product_revision_variants proposed
      join public.product_variants live on live.sku = proposed.sku
      where proposed.revision_id = requested_revision_id
        and (proposed.source_variant_id is null or live.id <> proposed.source_variant_id)
        and live.product_id <> target_product.id
    ) then raise exception using errcode = '23505', message = 'revision_sku_conflict'; end if;
    if exists (
      select 1
      from public.product_revision_variants proposed
      join public.product_variants live on live.id = proposed.source_variant_id
      where proposed.revision_id = requested_revision_id
        and live.product_id <> target_product.id
    ) then raise exception using errcode = '55000', message = 'revision_variant_changed'; end if;

    -- The tilde is rejected by every seller-facing SKU validator. This reserved
    -- namespace makes swaps safe despite the immediate global unique constraint.
    update public.product_variants live set
      sku = '~REV' || replace(live.id::text, '-', ''),
      updated_at = now()
    where live.product_id = target_product.id
      and exists (
        select 1 from public.product_revision_variants proposed
        where proposed.revision_id = requested_revision_id
          and proposed.source_variant_id = live.id
      );

    for revision_variant in
      select proposed.* from public.product_revision_variants proposed
      where proposed.revision_id = requested_revision_id
        and proposed.source_variant_id is not null
      order by proposed.created_at
    loop
      update public.product_variants set
        sku = revision_variant.sku,
        title = revision_variant.title,
        price_cents = revision_variant.price_cents,
        active = revision_variant.active,
        updated_at = now()
      where id = revision_variant.source_variant_id;
    end loop;

    insert into public.product_variants (
      product_id, sku, title, price_cents, currency, stock_on_hand,
      stock_reserved, active
    )
    select target_product.id, proposed.sku, proposed.title,
      proposed.price_cents, proposed.currency, proposed.stock_on_hand, 0,
      proposed.active
    from public.product_revision_variants proposed
    where proposed.revision_id = requested_revision_id
      and proposed.source_variant_id is null
    order by proposed.created_at;

    update public.products set
      title = target_revision.title,
      slug = target_revision.slug,
      description = target_revision.description,
      category = target_revision.category,
      updated_at = now()
    where id = target_product.id;
  end if;

  update public.product_revisions set
    status = requested_decision::public.product_revision_status,
    reviewed_by = current_user_id,
    reviewed_at = now(),
    review_rationale = normalized_rationale,
    updated_at = now()
  where id = requested_revision_id;

  insert into public.moderation_decisions (
    entity_type, entity_id, decision, rationale, reviewer_id
  ) values (
    'product_revision', requested_revision_id, requested_decision,
    normalized_rationale, current_user_id
  );
end;
$$;

revoke all on function public.start_product_revision(uuid) from public;
revoke all on function public.update_product_revision(uuid, text, text, text, text) from public;
revoke all on function public.save_product_revision_variant(uuid, uuid, text, text, integer, integer, boolean) from public;
revoke all on function public.set_published_variant_inventory(uuid, integer) from public;
revoke all on function public.submit_product_revision(uuid) from public;
revoke all on function public.withdraw_product_revision(uuid) from public;
revoke all on function public.review_product_revision(uuid, text, text) from public;
grant execute on function public.start_product_revision(uuid) to authenticated;
grant execute on function public.update_product_revision(uuid, text, text, text, text) to authenticated;
grant execute on function public.save_product_revision_variant(uuid, uuid, text, text, integer, integer, boolean) to authenticated;
grant execute on function public.set_published_variant_inventory(uuid, integer) to authenticated;
grant execute on function public.submit_product_revision(uuid) to authenticated;
grant execute on function public.withdraw_product_revision(uuid) to authenticated;
grant execute on function public.review_product_revision(uuid, text, text) to authenticated;
