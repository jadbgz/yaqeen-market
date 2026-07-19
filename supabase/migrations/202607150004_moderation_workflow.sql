create table public.moderation_decisions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('shop', 'product')),
  entity_id uuid not null,
  decision text not null check (decision in ('approved', 'rejected')),
  rationale text not null check (char_length(rationale) between 10 and 2000),
  reviewer_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index moderation_decisions_entity_idx
  on public.moderation_decisions(entity_type, entity_id, created_at desc);

alter table public.moderation_decisions enable row level security;
grant select on public.moderation_decisions to authenticated;

create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('operator', 'admin')
  );
$$;

revoke all on function public.is_operator() from public;
grant execute on function public.is_operator() to authenticated;

drop policy if exists shops_owner_insert on public.shops;
drop policy if exists shops_member_update on public.shops;
revoke insert on table public.shops from authenticated;
revoke update (name, description, ships_from_country, updated_at) on table public.shops from authenticated;

create policy shops_operator_read on public.shops
  for select to authenticated using (public.is_operator());
create policy products_operator_read on public.products
  for select to authenticated using (public.is_operator());
create policy variants_operator_read on public.product_variants
  for select to authenticated using (public.is_operator());
create policy evidence_operator_read on public.product_evidence
  for select to authenticated using (public.is_operator());
create policy moderation_decisions_operator_read on public.moderation_decisions
  for select to authenticated using (public.is_operator());

create or replace function public.submit_shop_for_review(requested_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_status public.shop_status;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if not exists (
    select 1 from public.shops s
    left join public.shop_members m on m.shop_id = s.id and m.user_id = current_user_id
    where s.id = requested_shop_id
      and (s.owner_id = current_user_id or m.member_role in ('owner', 'manager'))
  ) then
    raise exception using errcode = '42501', message = 'shop_management_required';
  end if;

  select status into current_status
  from public.shops
  where id = requested_shop_id
    and description is not null
    and char_length(trim(description)) >= 20
    and ships_from_country is not null
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'shop_profile_incomplete';
  end if;

  if current_status not in ('draft', 'rejected') then
    raise exception using errcode = '55000', message = 'shop_not_submittable';
  end if;

  update public.shops
  set status = 'under_review', updated_at = now()
  where id = requested_shop_id;
end;
$$;

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
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select p.* into target_product
  from public.products p
  where p.id = requested_product_id
  for update;

  if not found or not public.is_shop_member(target_product.shop_id) then
    raise exception using errcode = '42501', message = 'product_ownership_required';
  end if;

  if target_product.status <> 'draft' then
    raise exception using errcode = '55000', message = 'product_not_submittable';
  end if;

  select status into target_shop_status from public.shops where id = target_product.shop_id;
  if target_shop_status not in ('under_review', 'approved') then
    raise exception using errcode = '55000', message = 'shop_must_be_submitted_first';
  end if;

  if target_product.description is null or char_length(trim(target_product.description)) < 40 then
    raise exception using errcode = '22023', message = 'product_description_incomplete';
  end if;

  if not exists (
    select 1 from public.product_variants
    where product_id = requested_product_id and active and price_cents > 0
  ) then
    raise exception using errcode = '22023', message = 'active_variant_required';
  end if;

  if not exists (
    select 1 from public.product_evidence
    where product_id = requested_product_id
      and status = 'pending'
      and public_summary is not null
      and char_length(trim(public_summary)) >= 20
  ) then
    raise exception using errcode = '22023', message = 'reviewable_evidence_required';
  end if;

  update public.products
  set status = 'under_review', updated_at = now()
  where id = requested_product_id;
end;
$$;

create or replace function public.review_shop_submission(
  requested_shop_id uuid,
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
  current_status public.shop_status;
begin
  if current_user_id is null or not public.is_operator() then
    raise exception using errcode = '42501', message = 'operator_role_required';
  end if;
  if requested_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid_review_decision';
  end if;
  if normalized_rationale is null or char_length(normalized_rationale) not between 10 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_review_rationale';
  end if;

  select status into current_status from public.shops where id = requested_shop_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'shop_not_found';
  end if;
  if current_status <> 'under_review' then
    raise exception using errcode = '55000', message = 'shop_not_under_review';
  end if;

  update public.shops
  set status = requested_decision::public.shop_status, updated_at = now()
  where id = requested_shop_id;

  insert into public.moderation_decisions (entity_type, entity_id, decision, rationale, reviewer_id)
  values ('shop', requested_shop_id, requested_decision, normalized_rationale, current_user_id);
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
begin
  if current_user_id is null or not public.is_operator() then
    raise exception using errcode = '42501', message = 'operator_role_required';
  end if;
  if requested_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid_review_decision';
  end if;
  if normalized_rationale is null or char_length(normalized_rationale) not between 10 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_review_rationale';
  end if;
  if requested_decision = 'approved'
    and (normalized_summary is null or char_length(normalized_summary) not between 20 and 1000) then
    raise exception using errcode = '22023', message = 'public_summary_required';
  end if;

  select p.* into target_product from public.products p
  where p.id = requested_product_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'product_not_found';
  end if;
  if target_product.status <> 'under_review' then
    raise exception using errcode = '55000', message = 'product_not_under_review';
  end if;
  if requested_decision = 'approved'
    and not exists (select 1 from public.shops where id = target_product.shop_id and status = 'approved') then
    raise exception using errcode = '55000', message = 'shop_must_be_approved';
  end if;
  if not exists (
    select 1 from public.product_evidence
    where id = requested_evidence_id and product_id = requested_product_id and status = 'pending'
  ) then
    raise exception using errcode = '22023', message = 'pending_evidence_required';
  end if;

  update public.product_evidence
  set status = requested_decision::public.evidence_status,
      public_summary = case when requested_decision = 'approved' then normalized_summary else public_summary end,
      reviewed_by = current_user_id,
      reviewed_at = now()
  where id = requested_evidence_id;

  update public.products
  set status = case when requested_decision = 'approved' then 'published'::public.product_status else 'rejected'::public.product_status end,
      verification_summary = case when requested_decision = 'approved' then normalized_summary else null end,
      published_at = case when requested_decision = 'approved' then now() else null end,
      updated_at = now()
  where id = requested_product_id;

  insert into public.moderation_decisions (entity_type, entity_id, decision, rationale, reviewer_id)
  values ('product', requested_product_id, requested_decision, normalized_rationale, current_user_id);
end;
$$;

revoke all on function public.submit_shop_for_review(uuid) from public;
revoke all on function public.submit_product_for_review(uuid) from public;
revoke all on function public.review_shop_submission(uuid, text, text) from public;
revoke all on function public.review_product_submission(uuid, uuid, text, text, text) from public;

grant execute on function public.submit_shop_for_review(uuid) to authenticated;
grant execute on function public.submit_product_for_review(uuid) to authenticated;
grant execute on function public.review_shop_submission(uuid, text, text) to authenticated;
grant execute on function public.review_product_submission(uuid, uuid, text, text, text) to authenticated;
