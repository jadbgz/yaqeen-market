create type public.product_media_status as enum ('pending', 'approved', 'rejected');

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_bucket text not null default 'product-media' check (storage_bucket = 'product-media'),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  position smallint not null check (position between 1 and 6),
  alt_text text not null check (char_length(trim(alt_text)) between 5 and 240),
  mime_type text not null check (mime_type = 'image/webp'),
  byte_size integer not null check (byte_size between 1 and 4194304),
  width integer not null check (width between 500 and 2400),
  height integer not null check (height between 500 and 2400),
  status public.product_media_status not null default 'pending',
  submitted_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_media_review_state_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

create unique index product_media_active_position_idx
  on public.product_media(product_id, position)
  where status in ('pending', 'approved');
create index product_media_product_status_idx
  on public.product_media(product_id, status, position);

alter table public.product_media enable row level security;

create policy product_media_public_or_member_read on public.product_media
  for select to anon, authenticated using (
    (
      status = 'approved'
      and exists (
        select 1
        from public.products p
        join public.shops s on s.id = p.shop_id
        where p.id = product_id and p.status = 'published' and s.status = 'approved'
      )
    )
    or exists (
      select 1 from public.products p
      where p.id = product_id and public.is_shop_member(p.shop_id)
    )
  );

create policy product_media_operator_read on public.product_media
  for select to authenticated using (public.is_operator());

grant select on public.product_media to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-media', 'product-media', false, 4194304, array['image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy product_media_object_public_or_member_read on storage.objects
  for select to anon, authenticated using (
    bucket_id = 'product-media'
    and exists (
      select 1
      from public.product_media pm
      join public.products p on p.id = pm.product_id
      join public.shops s on s.id = p.shop_id
      where pm.storage_path = name
        and (
          (pm.status = 'approved' and p.status = 'published' and s.status = 'approved')
          or public.is_shop_member(p.shop_id)
        )
    )
  );

create policy product_media_object_operator_read on storage.objects
  for select to authenticated using (
    bucket_id = 'product-media'
    and public.is_operator()
    and exists (select 1 from public.product_media pm where pm.storage_path = name)
  );

create policy product_media_object_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'product-media'
    and exists (
      select 1
      from public.product_media pm
      join public.products p on p.id = pm.product_id
      where pm.storage_path = name
        and pm.status = 'pending'
        and pm.submitted_by = (select auth.uid())
        and p.status in ('draft', 'rejected')
        and public.is_shop_member(p.shop_id)
    )
  );

create policy product_media_object_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'product-media'
    and exists (
      select 1
      from public.product_media pm
      join public.products p on p.id = pm.product_id
      where pm.storage_path = name
        and pm.status in ('pending', 'rejected')
        and public.is_shop_member(p.shop_id)
    )
  );

create or replace function public.create_product_media_draft(
  requested_product_id uuid,
  requested_position integer,
  requested_alt_text text,
  requested_byte_size integer,
  requested_width integer,
  requested_height integer
)
returns table (media_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_product public.products;
  new_media_id uuid := gen_random_uuid();
  new_storage_path text;
  normalized_alt text := nullif(trim(requested_alt_text), '');
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
  if target_product.status not in ('draft', 'rejected') then
    raise exception using errcode = '55000', message = 'product_media_locked';
  end if;
  if requested_position not between 1 and 6 then
    raise exception using errcode = '22023', message = 'invalid_media_position';
  end if;
  if normalized_alt is null or char_length(normalized_alt) not between 5 and 240 then
    raise exception using errcode = '22023', message = 'invalid_media_alt_text';
  end if;
  if requested_byte_size not between 1 and 4194304
    or requested_width not between 500 and 2400
    or requested_height not between 500 and 2400 then
    raise exception using errcode = '22023', message = 'invalid_media_dimensions_or_size';
  end if;
  if (select count(*) from public.product_media where product_id = requested_product_id and status in ('pending', 'approved')) >= 6 then
    raise exception using errcode = '22023', message = 'product_media_limit_reached';
  end if;
  if exists (
    select 1 from public.product_media
    where product_id = requested_product_id
      and position = requested_position
      and status in ('pending', 'approved')
  ) then
    raise exception using errcode = '23505', message = 'product_media_position_taken';
  end if;

  new_storage_path := requested_product_id::text || '/' || new_media_id::text || '.webp';
  insert into public.product_media (
    id, product_id, storage_path, position, alt_text, mime_type,
    byte_size, width, height, submitted_by
  ) values (
    new_media_id, requested_product_id, new_storage_path, requested_position,
    normalized_alt, 'image/webp', requested_byte_size,
    requested_width, requested_height, current_user_id
  );

  return query select new_media_id, new_storage_path;
end;
$$;

create or replace function public.discard_product_media(requested_media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_media public.product_media;
  target_shop_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select pm.* into target_media
  from public.product_media pm
  where pm.id = requested_media_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'product_media_ownership_required';
  end if;
  select p.shop_id into target_shop_id from public.products p where p.id = target_media.product_id;
  if not public.is_shop_member(target_shop_id) then
    raise exception using errcode = '42501', message = 'product_media_ownership_required';
  end if;
  if target_media.status not in ('pending', 'rejected') then
    raise exception using errcode = '55000', message = 'approved_media_cannot_be_discarded';
  end if;

  delete from public.product_media where id = requested_media_id;
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
  if current_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select p.* into target_product from public.products p where p.id = requested_product_id for update;
  if not found or not public.is_shop_member(target_product.shop_id) then raise exception using errcode = '42501', message = 'product_ownership_required'; end if;
  if target_product.status <> 'draft' then raise exception using errcode = '55000', message = 'product_not_submittable'; end if;
  select status into target_shop_status from public.shops where id = target_product.shop_id;
  if target_shop_status not in ('under_review', 'approved') then raise exception using errcode = '55000', message = 'shop_must_be_submitted_first'; end if;
  if target_product.description is null or char_length(trim(target_product.description)) < 40 then raise exception using errcode = '22023', message = 'product_description_incomplete'; end if;
  if not exists (select 1 from public.product_variants where product_id = requested_product_id and active and price_cents > 0) then raise exception using errcode = '22023', message = 'active_variant_required'; end if;
  if not exists (select 1 from public.product_evidence where product_id = requested_product_id and status = 'pending' and public_summary is not null and char_length(trim(public_summary)) >= 20) then raise exception using errcode = '22023', message = 'reviewable_evidence_required'; end if;
  if not exists (
    select 1 from public.product_media pm
    join storage.objects so on so.bucket_id = pm.storage_bucket and so.name = pm.storage_path
    where pm.product_id = requested_product_id and pm.status = 'pending'
  ) then raise exception using errcode = '22023', message = 'reviewable_product_media_required'; end if;
  update public.products set status = 'under_review', updated_at = now() where id = requested_product_id;
end;
$$;

alter table public.moderation_decisions drop constraint moderation_decisions_entity_type_check;
alter table public.moderation_decisions add constraint moderation_decisions_entity_type_check
  check (entity_type in ('shop', 'product', 'product_media'));

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
  target_media_id uuid;
begin
  if current_user_id is null or not public.is_operator() then raise exception using errcode = '42501', message = 'operator_role_required'; end if;
  if requested_decision not in ('approved', 'rejected') then raise exception using errcode = '22023', message = 'invalid_review_decision'; end if;
  if normalized_rationale is null or char_length(normalized_rationale) not between 10 and 2000 then raise exception using errcode = '22023', message = 'invalid_review_rationale'; end if;
  if requested_decision = 'approved' and (normalized_summary is null or char_length(normalized_summary) not between 20 and 1000) then raise exception using errcode = '22023', message = 'public_summary_required'; end if;

  select p.* into target_product from public.products p where p.id = requested_product_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'product_not_found'; end if;
  if target_product.status <> 'under_review' then raise exception using errcode = '55000', message = 'product_not_under_review'; end if;
  if requested_decision = 'approved' and not exists (select 1 from public.shops where id = target_product.shop_id and status = 'approved') then raise exception using errcode = '55000', message = 'shop_must_be_approved'; end if;
  if not exists (select 1 from public.product_evidence where id = requested_evidence_id and product_id = requested_product_id and status = 'pending') then raise exception using errcode = '22023', message = 'pending_evidence_required'; end if;
  if not exists (
    select 1 from public.product_media pm
    join storage.objects so on so.bucket_id = pm.storage_bucket and so.name = pm.storage_path
    where pm.product_id = requested_product_id and pm.status = 'pending'
  ) then raise exception using errcode = '22023', message = 'pending_product_media_required'; end if;

  update public.product_evidence
  set status = requested_decision::public.evidence_status,
      public_summary = case when requested_decision = 'approved' then normalized_summary else public_summary end,
      reviewed_by = current_user_id, reviewed_at = now()
  where id = requested_evidence_id;

  for target_media_id in
    update public.product_media
    set status = requested_decision::public.product_media_status,
        reviewed_by = current_user_id, reviewed_at = now(), updated_at = now()
    where product_id = requested_product_id and status = 'pending'
    returning id
  loop
    insert into public.moderation_decisions (entity_type, entity_id, decision, rationale, reviewer_id)
    values ('product_media', target_media_id, requested_decision, normalized_rationale, current_user_id);
  end loop;

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

revoke all on table public.product_media from anon, authenticated;
grant select on table public.product_media to anon, authenticated;
revoke all on function public.create_product_media_draft(uuid, integer, text, integer, integer, integer) from public;
revoke all on function public.discard_product_media(uuid) from public;
grant execute on function public.create_product_media_draft(uuid, integer, text, integer, integer, integer) to authenticated;
grant execute on function public.discard_product_media(uuid) to authenticated;

-- A pre-existing publication cannot remain public after media becomes mandatory.
update public.products p
set status = 'draft', published_at = null, updated_at = now()
where p.status = 'published'
  and not exists (select 1 from public.product_media pm where pm.product_id = p.id and pm.status = 'approved');
