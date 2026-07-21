-- Seller catalog lifecycle v2: editable drafts, multiple variants and evidence,
-- plus one database-owned definition of public trust eligibility.

do $$
declare
  review_constraint_name text;
begin
  select constraint_row.conname into review_constraint_name
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.product_evidence'::regclass
    and constraint_row.contype = 'c'
    and pg_get_constraintdef(constraint_row.oid) like '%reviewed_by%reviewed_at%'
  limit 1;
  if review_constraint_name is not null then
    execute format('alter table public.product_evidence drop constraint %I', review_constraint_name);
  end if;
end;
$$;

alter table public.product_evidence
  add constraint product_evidence_review_state_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('approved', 'rejected', 'expired', 'revoked') and reviewed_by is not null and reviewed_at is not null)
  );

create or replace function public.is_evidence_current(requested_valid_from date, requested_valid_until date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (requested_valid_from is null or requested_valid_from <= current_date)
    and (requested_valid_until is null or requested_valid_until >= current_date);
$$;

create or replace function public.has_current_approved_evidence(requested_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.product_evidence evidence
    where evidence.product_id = requested_product_id
      and evidence.status = 'approved'
      and evidence.public_summary is not null
      and char_length(trim(evidence.public_summary)) >= 20
      and public.is_evidence_current(evidence.valid_from, evidence.valid_until)
  );
$$;

create or replace function public.is_product_publicly_listed(requested_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.products product
    join public.shops shop on shop.id = product.shop_id
    where product.id = requested_product_id
      and product.status = 'published'
      and shop.status = 'approved'
      and public.has_current_approved_evidence(product.id)
      and exists (
        select 1 from public.product_variants variant
        where variant.product_id = product.id and variant.active and variant.price_cents > 0
      )
      and exists (
        select 1 from public.product_media media
        where media.product_id = product.id and media.status = 'approved'
      )
  );
$$;

revoke all on function public.is_evidence_current(date, date) from public;
revoke all on function public.has_current_approved_evidence(uuid) from public;
revoke all on function public.is_product_publicly_listed(uuid) from public;
grant execute on function public.is_evidence_current(date, date) to anon, authenticated;
grant execute on function public.has_current_approved_evidence(uuid) to anon, authenticated;
grant execute on function public.is_product_publicly_listed(uuid) to anon, authenticated;

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products
  for select to anon, authenticated using (
    public.is_product_publicly_listed(id) or public.is_shop_member(shop_id)
  );

drop policy if exists variants_public_read on public.product_variants;
create policy variants_public_read on public.product_variants
  for select to anon, authenticated using (
    public.is_product_publicly_listed(product_id)
    or exists (
      select 1 from public.products product
      where product.id = product_id and public.is_shop_member(product.shop_id)
    )
  );

drop policy if exists evidence_public_read on public.product_evidence;
create policy evidence_public_read on public.product_evidence
  for select to anon, authenticated using (
    (
      status = 'approved'
      and public_summary is not null
      and public.is_evidence_current(valid_from, valid_until)
      and public.is_product_publicly_listed(product_id)
    )
    or exists (
      select 1 from public.products product
      where product.id = product_id and public.is_shop_member(product.shop_id)
    )
  );

drop policy if exists product_media_public_or_member_read on public.product_media;
create policy product_media_public_or_member_read on public.product_media
  for select to anon, authenticated using (
    (status = 'approved' and public.is_product_publicly_listed(product_id))
    or exists (
      select 1 from public.products product
      where product.id = product_id and public.is_shop_member(product.shop_id)
    )
  );

create or replace function public.can_read_product_media_object(requested_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.product_media media
    where media.storage_path = requested_path
      and media.status = 'approved'
      and public.is_product_publicly_listed(media.product_id)
  ) or exists (
    select 1
    from public.product_media media
    join public.products product on product.id = media.product_id
    left join public.profiles viewer on viewer.id = (select auth.uid())
    where media.storage_path = requested_path
      and (public.is_shop_member(product.shop_id) or viewer.role in ('operator', 'admin'))
  );
$$;

create or replace function public.update_product_draft(
  requested_product_id uuid,
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
  target_product public.products;
  normalized_title text := nullif(trim(requested_title), '');
  normalized_slug text := lower(nullif(trim(requested_slug), ''));
  normalized_description text := nullif(trim(requested_description), '');
  normalized_category text := lower(nullif(trim(requested_category), ''));
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select product.* into target_product from public.products product where product.id = requested_product_id for update;
  if not found or not public.is_shop_member(target_product.shop_id) then raise exception using errcode = '42501', message = 'product_ownership_required'; end if;
  if target_product.status not in ('draft', 'rejected') then raise exception using errcode = '55000', message = 'product_content_locked'; end if;
  if normalized_title is null or char_length(normalized_title) not between 2 and 180 then raise exception using errcode = '22023', message = 'invalid_product_title'; end if;
  if normalized_slug is null or char_length(normalized_slug) not between 3 and 100 or normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception using errcode = '22023', message = 'invalid_product_slug'; end if;
  if normalized_description is null or char_length(normalized_description) not between 40 and 5000 then raise exception using errcode = '22023', message = 'invalid_product_description'; end if;
  if normalized_category is null or normalized_category <> all(array['parfums', 'cosmetiques', 'livres', 'mode', 'bien-etre', 'complements', 'maison']) then raise exception using errcode = '22023', message = 'invalid_product_category'; end if;

  update public.products set
    title = normalized_title,
    slug = normalized_slug,
    description = normalized_description,
    category = normalized_category,
    status = 'draft',
    verification_summary = null,
    published_at = null,
    updated_at = now()
  where id = requested_product_id;
end;
$$;

create or replace function public.save_product_variant(
  requested_product_id uuid,
  requested_variant_id uuid,
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
  target_product public.products;
  target_variant public.product_variants;
  normalized_title text := nullif(trim(requested_title), '');
  normalized_sku text := upper(nullif(trim(requested_sku), ''));
  saved_variant_id uuid;
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select product.* into target_product from public.products product where product.id = requested_product_id for update;
  if not found or not public.is_shop_member(target_product.shop_id) then raise exception using errcode = '42501', message = 'product_ownership_required'; end if;
  if target_product.status not in ('draft', 'rejected') then raise exception using errcode = '55000', message = 'product_variants_locked'; end if;
  if normalized_title is null or char_length(normalized_title) not between 2 and 120 then raise exception using errcode = '22023', message = 'invalid_variant_title'; end if;
  if normalized_sku is null or char_length(normalized_sku) not between 3 and 64 or normalized_sku !~ '^[A-Z0-9][A-Z0-9._-]+$' then raise exception using errcode = '22023', message = 'invalid_sku'; end if;
  if requested_price_cents is null or requested_price_cents not between 1 and 10000000 then raise exception using errcode = '22023', message = 'invalid_price'; end if;
  if requested_stock_on_hand is null or requested_stock_on_hand not between 0 and 1000000 then raise exception using errcode = '22023', message = 'invalid_stock'; end if;

  if requested_variant_id is null then
    insert into public.product_variants (product_id, sku, title, price_cents, currency, stock_on_hand, stock_reserved, active)
    values (requested_product_id, normalized_sku, normalized_title, requested_price_cents, 'EUR', requested_stock_on_hand, 0, coalesce(requested_active, true))
    returning id into saved_variant_id;
  else
    select variant.* into target_variant
    from public.product_variants variant
    where variant.id = requested_variant_id and variant.product_id = requested_product_id
    for update;
    if not found then raise exception using errcode = '42501', message = 'variant_ownership_required'; end if;
    if requested_stock_on_hand < target_variant.stock_reserved then raise exception using errcode = '22023', message = 'stock_below_reserved'; end if;
    update public.product_variants set
      sku = normalized_sku,
      title = normalized_title,
      price_cents = requested_price_cents,
      stock_on_hand = requested_stock_on_hand,
      active = coalesce(requested_active, true),
      updated_at = now()
    where id = requested_variant_id
    returning id into saved_variant_id;
  end if;

  update public.products set status = 'draft', verification_summary = null, published_at = null, updated_at = now()
  where id = requested_product_id and status = 'rejected';
  return saved_variant_id;
end;
$$;

create or replace function public.deactivate_product_variant(requested_variant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_variant public.product_variants;
  target_product public.products;
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select variant.* into target_variant from public.product_variants variant where variant.id = requested_variant_id for update;
  if not found then raise exception using errcode = '42501', message = 'variant_ownership_required'; end if;
  select product.* into target_product from public.products product where product.id = target_variant.product_id for update;
  if not public.is_shop_member(target_product.shop_id) then raise exception using errcode = '42501', message = 'variant_ownership_required'; end if;
  if target_product.status not in ('draft', 'rejected') then raise exception using errcode = '55000', message = 'product_variants_locked'; end if;
  if target_variant.stock_reserved > 0 then raise exception using errcode = '55000', message = 'variant_has_reserved_stock'; end if;
  update public.product_variants set active = false, updated_at = now() where id = requested_variant_id;
  update public.products set status = 'draft', verification_summary = null, published_at = null, updated_at = now()
  where id = target_variant.product_id and status = 'rejected';
end;
$$;

create or replace function public.add_product_evidence(
  requested_product_id uuid,
  requested_kind text,
  requested_scope text,
  requested_issuer_name text default null,
  requested_reference_number text default null,
  requested_public_summary text default null,
  requested_valid_from date default null,
  requested_valid_until date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_product public.products;
  normalized_scope text := nullif(trim(requested_scope), '');
  normalized_issuer text := nullif(trim(requested_issuer_name), '');
  normalized_reference text := nullif(trim(requested_reference_number), '');
  normalized_summary text := nullif(trim(requested_public_summary), '');
  created_evidence_id uuid;
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select product.* into target_product from public.products product where product.id = requested_product_id for update;
  if not found or not public.is_shop_member(target_product.shop_id) then raise exception using errcode = '42501', message = 'product_ownership_required'; end if;
  if target_product.status not in ('draft', 'rejected') then raise exception using errcode = '55000', message = 'product_evidence_locked'; end if;
  if requested_kind not in ('seller_declaration', 'third_party_certificate') then raise exception using errcode = '22023', message = 'invalid_evidence_kind'; end if;
  if normalized_scope is null or char_length(normalized_scope) not between 10 and 2000 then raise exception using errcode = '22023', message = 'invalid_evidence_scope'; end if;
  if requested_kind = 'third_party_certificate' and (normalized_issuer is null or normalized_reference is null) then raise exception using errcode = '22023', message = 'certificate_details_required'; end if;
  if normalized_issuer is not null and char_length(normalized_issuer) > 180 then raise exception using errcode = '22023', message = 'invalid_evidence_details'; end if;
  if normalized_reference is not null and char_length(normalized_reference) > 180 then raise exception using errcode = '22023', message = 'invalid_evidence_details'; end if;
  if normalized_summary is null or char_length(normalized_summary) not between 20 and 1000 then raise exception using errcode = '22023', message = 'invalid_public_summary'; end if;
  if requested_valid_from is not null and requested_valid_until is not null and requested_valid_until < requested_valid_from then raise exception using errcode = '22023', message = 'invalid_evidence_validity'; end if;
  if requested_valid_until is not null and requested_valid_until < current_date then raise exception using errcode = '22023', message = 'evidence_already_expired'; end if;

  insert into public.product_evidence (
    product_id, kind, status, issuer_name, reference_number, scope,
    valid_from, valid_until, public_summary, submitted_by
  ) values (
    requested_product_id, requested_kind::public.evidence_kind, 'pending',
    normalized_issuer, normalized_reference, normalized_scope,
    requested_valid_from, requested_valid_until, normalized_summary, current_user_id
  ) returning id into created_evidence_id;

  update public.products set status = 'draft', verification_summary = null, published_at = null, updated_at = now()
  where id = requested_product_id and status = 'rejected';
  return created_evidence_id;
end;
$$;

create or replace function public.discard_pending_product_evidence(requested_evidence_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_evidence public.product_evidence;
  target_product public.products;
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select evidence.* into target_evidence from public.product_evidence evidence where evidence.id = requested_evidence_id for update;
  if not found then raise exception using errcode = '42501', message = 'evidence_ownership_required'; end if;
  select product.* into target_product from public.products product where product.id = target_evidence.product_id for update;
  if not public.is_shop_member(target_product.shop_id) then raise exception using errcode = '42501', message = 'evidence_ownership_required'; end if;
  if target_product.status not in ('draft', 'rejected') or target_evidence.status <> 'pending' then raise exception using errcode = '55000', message = 'evidence_cannot_be_discarded'; end if;
  delete from public.product_evidence where id = requested_evidence_id;
end;
$$;

-- Expiration can be invoked by a scheduler through service_role or manually by
-- an operator. The public gates above are date-aware even before this cleanup.
create or replace function public.expire_due_product_evidence()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not public.is_operator() then
    raise exception using errcode = '42501', message = 'operator_or_service_role_required';
  end if;

  update public.product_evidence
  set status = 'expired'
  where status = 'approved' and valid_until is not null and valid_until < current_date;
  get diagnostics expired_count = row_count;

  update public.products product
  set status = 'rejected', verification_summary = null, published_at = null, updated_at = now()
  where product.status = 'published'
    and not public.has_current_approved_evidence(product.id);
  return expired_count;
end;
$$;

create or replace function public.enforce_current_evidence_on_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Internal backfills and trusted maintenance can seed historical rows. The
  -- customer reservation RPC always carries auth.uid() and is checked here.
  if (select auth.uid()) is null then return new; end if;
  if not exists (
    select 1
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    join public.shops shop on shop.id = product.shop_id
    where variant.id = new.variant_id
      and variant.active
      and variant.price_cents > 0
      and product.status = 'published'
      and shop.status = 'approved'
      and public.has_current_approved_evidence(product.id)
  ) then
    raise exception using errcode = '22023', message = 'variant_not_orderable';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_reservations_current_evidence on public.inventory_reservations;
create trigger inventory_reservations_current_evidence
before insert or update of variant_id on public.inventory_reservations
for each row execute function public.enforce_current_evidence_on_reservation();

-- Submission and approval both evaluate the chosen evidence at transaction
-- time; a certificate cannot be submitted early or approved after expiry.
create or replace function public.submit_product_for_review(requested_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_product public.products;
  target_shop_status public.shop_status;
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select product.* into target_product from public.products product where product.id = requested_product_id for update;
  if not found or not public.is_shop_member(target_product.shop_id) then raise exception using errcode = '42501', message = 'product_ownership_required'; end if;
  if target_product.status <> 'draft' then raise exception using errcode = '55000', message = 'product_not_submittable'; end if;
  select status into target_shop_status from public.shops where id = target_product.shop_id;
  if target_shop_status not in ('under_review', 'approved') then raise exception using errcode = '55000', message = 'shop_must_be_submitted_first'; end if;
  if target_product.description is null or char_length(trim(target_product.description)) < 40 then raise exception using errcode = '22023', message = 'product_description_incomplete'; end if;
  if not exists (select 1 from public.product_variants where product_id = requested_product_id and active and price_cents > 0) then raise exception using errcode = '22023', message = 'active_variant_required'; end if;
  if not exists (
    select 1 from public.product_evidence evidence
    where evidence.product_id = requested_product_id
      and evidence.status = 'pending'
      and evidence.public_summary is not null
      and char_length(trim(evidence.public_summary)) >= 20
      and public.is_evidence_current(evidence.valid_from, evidence.valid_until)
  ) then raise exception using errcode = '22023', message = 'reviewable_evidence_required'; end if;
  if not exists (
    select 1 from public.product_media media
    join storage.objects object on object.bucket_id = media.storage_bucket and object.name = media.storage_path
    where media.product_id = requested_product_id and media.status = 'pending'
  ) then raise exception using errcode = '22023', message = 'reviewable_product_media_required'; end if;
  update public.products set status = 'under_review', updated_at = now() where id = requested_product_id;
end;
$$;

create or replace function public.review_product_submission(
  requested_product_id uuid,
  requested_evidence_id uuid,
  requested_decision text,
  requested_rationale text,
  requested_public_summary text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_rationale text := nullif(trim(requested_rationale), '');
  normalized_summary text := nullif(trim(requested_public_summary), '');
  target_product public.products;
  target_evidence public.product_evidence;
  target_media_id uuid;
begin
  if current_user_id is null or not public.is_operator() then raise exception using errcode = '42501', message = 'operator_role_required'; end if;
  if requested_decision not in ('approved', 'rejected') then raise exception using errcode = '22023', message = 'invalid_review_decision'; end if;
  if normalized_rationale is null or char_length(normalized_rationale) not between 10 and 2000 then raise exception using errcode = '22023', message = 'invalid_review_rationale'; end if;
  if requested_decision = 'approved' and (normalized_summary is null or char_length(normalized_summary) not between 20 and 1000) then raise exception using errcode = '22023', message = 'public_summary_required'; end if;

  select product.* into target_product from public.products product where product.id = requested_product_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'product_not_found'; end if;
  if target_product.status <> 'under_review' then raise exception using errcode = '55000', message = 'product_not_under_review'; end if;
  if requested_decision = 'approved' and not exists (select 1 from public.shops where id = target_product.shop_id and status = 'approved') then raise exception using errcode = '55000', message = 'shop_must_be_approved'; end if;
  select evidence.* into target_evidence
  from public.product_evidence evidence
  where evidence.id = requested_evidence_id and evidence.product_id = requested_product_id and evidence.status = 'pending'
  for update;
  if not found then raise exception using errcode = '22023', message = 'pending_evidence_required'; end if;
  if requested_decision = 'approved' and not public.is_evidence_current(target_evidence.valid_from, target_evidence.valid_until) then raise exception using errcode = '22023', message = 'evidence_not_current'; end if;
  if not exists (
    select 1 from public.product_media media
    join storage.objects object on object.bucket_id = media.storage_bucket and object.name = media.storage_path
    where media.product_id = requested_product_id and media.status = 'pending'
  ) then raise exception using errcode = '22023', message = 'pending_product_media_required'; end if;

  update public.product_evidence set
    status = requested_decision::public.evidence_status,
    public_summary = case when requested_decision = 'approved' then normalized_summary else public_summary end,
    reviewed_by = current_user_id,
    reviewed_at = now()
  where id = requested_evidence_id;

  for target_media_id in
    update public.product_media set
      status = requested_decision::public.product_media_status,
      reviewed_by = current_user_id,
      reviewed_at = now(),
      updated_at = now()
    where product_id = requested_product_id and status = 'pending'
    returning id
  loop
    insert into public.moderation_decisions (entity_type, entity_id, decision, rationale, reviewer_id)
    values ('product_media', target_media_id, requested_decision, normalized_rationale, current_user_id);
  end loop;

  update public.products set
    status = case when requested_decision = 'approved' then 'published'::public.product_status else 'rejected'::public.product_status end,
    verification_summary = case when requested_decision = 'approved' then normalized_summary else null end,
    published_at = case when requested_decision = 'approved' then now() else null end,
    updated_at = now()
  where id = requested_product_id;

  insert into public.moderation_decisions (entity_type, entity_id, decision, rationale, reviewer_id)
  values ('product', requested_product_id, requested_decision, normalized_rationale, current_user_id);
end;
$$;

revoke all on function public.update_product_draft(uuid, text, text, text, text) from public;
revoke all on function public.save_product_variant(uuid, uuid, text, text, integer, integer, boolean) from public;
revoke all on function public.deactivate_product_variant(uuid) from public;
revoke all on function public.add_product_evidence(uuid, text, text, text, text, text, date, date) from public;
revoke all on function public.discard_pending_product_evidence(uuid) from public;
revoke all on function public.expire_due_product_evidence() from public;
revoke all on function public.enforce_current_evidence_on_reservation() from public;
grant execute on function public.update_product_draft(uuid, text, text, text, text) to authenticated;
grant execute on function public.save_product_variant(uuid, uuid, text, text, integer, integer, boolean) to authenticated;
grant execute on function public.deactivate_product_variant(uuid) to authenticated;
grant execute on function public.add_product_evidence(uuid, text, text, text, text, text, date, date) to authenticated;
grant execute on function public.discard_pending_product_evidence(uuid) to authenticated;
grant execute on function public.expire_due_product_evidence() to authenticated, service_role;

-- Re-assert the current-evidence gate inside search itself. This matters for
-- an authenticated seller searching while their member policy also exposes
-- their own non-public drafts.
create or replace function public.search_public_catalog(
  requested_query text default null,
  requested_category text default null,
  requested_min_cents integer default null,
  requested_max_cents integer default null,
  requested_only_available boolean default false,
  requested_sort text default 'selection',
  requested_limit integer default 24,
  requested_offset integer default 0
)
returns table (product_id uuid, variant_id uuid, total_count bigint)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select
      least(greatest(coalesce(requested_limit, 24), 1), 48) as page_size,
      least(greatest(coalesce(requested_offset, 0), 0), 100000) as page_offset,
      nullif(public.searchable_text(left(requested_query, 80)), '') as needle,
      nullif(lower(trim(requested_category)), '') as category_filter,
      case when requested_sort in ('selection', 'prix-asc', 'prix-desc') then requested_sort else 'selection' end as sort_key
  ),
  visible as (
    select product.id, product.published_at, chosen.variant_id, chosen.price_cents
    from public.products product
    join public.shops shop on shop.id = product.shop_id and shop.status = 'approved'
    cross join bounds
    cross join lateral (
      select variant.id as variant_id, variant.price_cents
      from public.product_variants variant
      where variant.product_id = product.id
        and variant.active
        and variant.price_cents > 0
        and (not coalesce(requested_only_available, false) or variant.stock_on_hand - variant.stock_reserved > 0)
      order by variant.price_cents asc, variant.id
      limit 1
    ) chosen
    where product.status = 'published'
      and public.is_product_publicly_listed(product.id)
      and (bounds.category_filter is null or product.category = bounds.category_filter)
      and (requested_min_cents is null or chosen.price_cents >= requested_min_cents)
      and (requested_max_cents is null or chosen.price_cents <= requested_max_cents)
      and (
        bounds.needle is null
        or public.searchable_text(product.title || ' ' || coalesce(product.description, '')) like '%' || bounds.needle || '%'
        or public.searchable_text(shop.name) like '%' || bounds.needle || '%'
      )
  )
  select visible.id, visible.variant_id, count(*) over ()
  from visible cross join bounds
  order by
    case when bounds.sort_key = 'prix-asc' then visible.price_cents end asc,
    case when bounds.sort_key = 'prix-desc' then visible.price_cents end desc,
    visible.published_at desc nulls last,
    visible.id
  limit (select page_size from bounds)
  offset (select page_offset from bounds);
$$;

create or replace function public.count_public_catalog_by_category(
  requested_query text default null,
  requested_min_cents integer default null,
  requested_max_cents integer default null,
  requested_only_available boolean default false
)
returns table (category text, total bigint)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select nullif(public.searchable_text(left(requested_query, 80)), '') as needle
  )
  select product.category, count(*)::bigint
  from public.products product
  join public.shops shop on shop.id = product.shop_id and shop.status = 'approved'
  cross join bounds
  cross join lateral (
    select min(variant.price_cents) as min_price_cents
    from public.product_variants variant
    where variant.product_id = product.id
      and variant.active
      and variant.price_cents > 0
      and (not coalesce(requested_only_available, false) or variant.stock_on_hand - variant.stock_reserved > 0)
  ) pricing
  where product.status = 'published'
    and public.is_product_publicly_listed(product.id)
    and pricing.min_price_cents is not null
    and (requested_min_cents is null or pricing.min_price_cents >= requested_min_cents)
    and (requested_max_cents is null or pricing.min_price_cents <= requested_max_cents)
    and (
      bounds.needle is null
      or public.searchable_text(product.title || ' ' || coalesce(product.description, '')) like '%' || bounds.needle || '%'
      or public.searchable_text(shop.name) like '%' || bounds.needle || '%'
    )
  group by product.category;
$$;
