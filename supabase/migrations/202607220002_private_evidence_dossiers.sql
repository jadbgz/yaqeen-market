-- Evidence documents are confidential source material. Their public summary is
-- readable through product_evidence, but the binary stays seller/operator-only.

create table public.product_evidence_documents (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null unique references public.product_evidence(id) on delete cascade,
  storage_bucket text not null default 'product-evidence' check (storage_bucket = 'product-evidence'),
  storage_path text not null unique check (
    storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
  ),
  original_filename text not null check (char_length(original_filename) between 1 and 180),
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  byte_size integer not null check (byte_size between 5 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index product_evidence_documents_evidence_idx
  on public.product_evidence_documents(evidence_id);

alter table public.product_evidence_documents enable row level security;

create or replace function public.can_read_evidence_document(requested_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.product_evidence_documents document
    join public.product_evidence evidence on evidence.id = document.evidence_id
    join public.products product on product.id = evidence.product_id
    where document.id = requested_document_id
      and public.is_shop_member(product.shop_id)
  ) or public.is_operator();
$$;

create or replace function public.can_read_evidence_document_object(requested_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.product_evidence_documents document
    join public.product_evidence evidence on evidence.id = document.evidence_id
    join public.products product on product.id = evidence.product_id
    where document.storage_path = requested_path
      and public.is_shop_member(product.shop_id)
  ) or (
    public.is_operator()
    and exists (
      select 1 from public.product_evidence_documents document
      where document.storage_path = requested_path
    )
  );
$$;

revoke all on function public.can_read_evidence_document(uuid) from public;
revoke all on function public.can_read_evidence_document_object(text) from public;
grant execute on function public.can_read_evidence_document(uuid) to authenticated;
grant execute on function public.can_read_evidence_document_object(text) to authenticated;

create policy evidence_documents_authorized_read on public.product_evidence_documents
  for select to authenticated using (public.can_read_evidence_document(id));

revoke all on table public.product_evidence_documents from anon, authenticated;
grant select on table public.product_evidence_documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-evidence', 'product-evidence', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy evidence_document_object_read on storage.objects
  for select to authenticated using (
    bucket_id = 'product-evidence'
    and public.can_read_evidence_document_object(name)
  );

-- No authenticated INSERT/DELETE policy exists for this bucket. The trusted
-- web server hashes the received bytes and writes them with service_role.

-- A renewal on a published product remains private and pending. Existing
-- approved evidence continues to gate the storefront until the new decision.
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
  if target_product.status not in ('draft', 'rejected', 'published') then raise exception using errcode = '55000', message = 'product_evidence_locked'; end if;
  if target_product.status = 'published' and exists (
    select 1 from public.product_evidence evidence
    where evidence.product_id = requested_product_id and evidence.status = 'pending'
  ) then raise exception using errcode = '55000', message = 'published_evidence_renewal_already_pending'; end if;
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

create or replace function public.register_evidence_document(
  requested_evidence_id uuid,
  requested_original_filename text,
  requested_byte_size integer,
  requested_sha256 text
)
returns table (document_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_evidence public.product_evidence;
  target_product public.products;
  created_document_id uuid := gen_random_uuid();
  created_storage_path text;
  normalized_filename text := nullif(trim(regexp_replace(coalesce(requested_original_filename, ''), '[^A-Za-z0-9._ -]', '_', 'g')), '');
  normalized_sha256 text := lower(nullif(trim(requested_sha256), ''));
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select evidence.* into target_evidence from public.product_evidence evidence where evidence.id = requested_evidence_id for update;
  if not found then raise exception using errcode = '42501', message = 'evidence_ownership_required'; end if;
  select product.* into target_product from public.products product where product.id = target_evidence.product_id for update;
  if not public.is_shop_member(target_product.shop_id) then raise exception using errcode = '42501', message = 'evidence_ownership_required'; end if;
  if target_evidence.status <> 'pending' or target_product.status not in ('draft', 'rejected', 'published') then raise exception using errcode = '55000', message = 'evidence_document_locked'; end if;
  if exists (select 1 from public.product_evidence_documents where evidence_id = requested_evidence_id) then raise exception using errcode = '23505', message = 'evidence_document_already_exists'; end if;
  if normalized_filename is null or char_length(normalized_filename) > 180 or lower(normalized_filename) !~ '\.pdf$' then raise exception using errcode = '22023', message = 'invalid_evidence_filename'; end if;
  if requested_byte_size is null or requested_byte_size not between 5 and 10485760 then raise exception using errcode = '22023', message = 'invalid_evidence_document_size'; end if;
  if normalized_sha256 is null or normalized_sha256 !~ '^[0-9a-f]{64}$' then raise exception using errcode = '22023', message = 'invalid_evidence_document_hash'; end if;

  created_storage_path := target_product.id::text || '/' || target_evidence.id::text || '/' || created_document_id::text || '.pdf';
  insert into public.product_evidence_documents (
    id, evidence_id, storage_path, original_filename, byte_size, sha256, uploaded_by
  ) values (
    created_document_id, requested_evidence_id, created_storage_path,
    normalized_filename, requested_byte_size, normalized_sha256, current_user_id
  );
  return query select created_document_id, created_storage_path;
end;
$$;

create or replace function public.discard_evidence_document(requested_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_document public.product_evidence_documents;
  target_evidence public.product_evidence;
  target_shop_id uuid;
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select document.* into target_document from public.product_evidence_documents document where document.id = requested_document_id for update;
  if not found then raise exception using errcode = '42501', message = 'evidence_document_ownership_required'; end if;
  select evidence.* into target_evidence from public.product_evidence evidence where evidence.id = target_document.evidence_id for update;
  select product.shop_id into target_shop_id from public.products product where product.id = target_evidence.product_id;
  if not public.is_shop_member(target_shop_id) then raise exception using errcode = '42501', message = 'evidence_document_ownership_required'; end if;
  if target_evidence.status <> 'pending' then raise exception using errcode = '55000', message = 'evidence_document_locked'; end if;
  if exists (select 1 from storage.objects object where object.bucket_id = target_document.storage_bucket and object.name = target_document.storage_path) then raise exception using errcode = '55000', message = 'evidence_document_object_must_be_removed_first'; end if;
  delete from public.product_evidence_documents where id = requested_document_id;
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
  if target_product.status not in ('draft', 'rejected', 'published') or target_evidence.status <> 'pending' then raise exception using errcode = '55000', message = 'evidence_cannot_be_discarded'; end if;
  if exists (select 1 from public.product_evidence_documents where evidence_id = requested_evidence_id) then raise exception using errcode = '55000', message = 'evidence_document_must_be_discarded_first'; end if;
  delete from public.product_evidence where id = requested_evidence_id;
end;
$$;

create or replace function public.require_evidence_document_for_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status <> 'approved' and new.kind <> 'seller_declaration' then
    if not exists (
      select 1
      from public.product_evidence_documents document
      join storage.objects object
        on object.bucket_id = document.storage_bucket
       and object.name = document.storage_path
      where document.evidence_id = new.id
    ) then raise exception using errcode = '23514', message = 'evidence_document_required'; end if;
  end if;
  return new;
end;
$$;

create trigger evidence_document_required_before_approval
before update of status on public.product_evidence
for each row execute function public.require_evidence_document_for_approval();

create or replace function public.require_reviewable_evidence_document_on_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'under_review' and old.status <> 'under_review' and not exists (
    select 1
    from public.product_evidence evidence
    where evidence.product_id = new.id
      and evidence.status = 'pending'
      and (
        evidence.kind = 'seller_declaration'
        or exists (
          select 1
          from public.product_evidence_documents document
          join storage.objects object
            on object.bucket_id = document.storage_bucket
           and object.name = document.storage_path
          where document.evidence_id = evidence.id
        )
      )
  ) then raise exception using errcode = '23514', message = 'reviewable_evidence_document_required'; end if;
  return new;
end;
$$;

create trigger reviewable_evidence_document_required_before_submission
before update of status on public.products
for each row execute function public.require_reviewable_evidence_document_on_submission();

alter table public.moderation_decisions drop constraint moderation_decisions_entity_type_check;
alter table public.moderation_decisions add constraint moderation_decisions_entity_type_check
  check (entity_type in ('shop', 'product', 'product_media', 'product_revision', 'product_evidence'));

create or replace function public.review_published_product_evidence(
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
  target_evidence public.product_evidence;
  target_product public.products;
begin
  if current_user_id is null or not public.is_operator() then raise exception using errcode = '42501', message = 'operator_role_required'; end if;
  if requested_decision not in ('approved', 'rejected') then raise exception using errcode = '22023', message = 'invalid_review_decision'; end if;
  if normalized_rationale is null or char_length(normalized_rationale) not between 10 and 2000 then raise exception using errcode = '22023', message = 'invalid_review_rationale'; end if;
  if requested_decision = 'approved' and (normalized_summary is null or char_length(normalized_summary) not between 20 and 1000) then raise exception using errcode = '22023', message = 'public_summary_required'; end if;

  select evidence.* into target_evidence from public.product_evidence evidence where evidence.id = requested_evidence_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'evidence_not_found'; end if;
  if target_evidence.status <> 'pending' then raise exception using errcode = '55000', message = 'evidence_not_pending'; end if;
  select product.* into target_product from public.products product where product.id = target_evidence.product_id for update;
  if target_product.status <> 'published' then raise exception using errcode = '55000', message = 'published_product_required'; end if;
  if requested_decision = 'approved' and not public.is_evidence_current(target_evidence.valid_from, target_evidence.valid_until) then raise exception using errcode = '22023', message = 'evidence_not_current'; end if;
  if requested_decision = 'approved' and target_evidence.kind <> 'seller_declaration' and not exists (
    select 1
    from public.product_evidence_documents document
    join storage.objects object on object.bucket_id = document.storage_bucket and object.name = document.storage_path
    where document.evidence_id = target_evidence.id
  ) then raise exception using errcode = '23514', message = 'evidence_document_required'; end if;

  if requested_decision = 'approved' then
    update public.product_evidence set
      status = 'revoked', reviewed_by = current_user_id, reviewed_at = now()
    where product_id = target_product.id and status = 'approved' and id <> target_evidence.id;
  end if;

  update public.product_evidence set
    status = requested_decision::public.evidence_status,
    public_summary = case when requested_decision = 'approved' then normalized_summary else public_summary end,
    reviewed_by = current_user_id,
    reviewed_at = now()
  where id = target_evidence.id;

  if requested_decision = 'approved' then
    -- Evidence renewal is a trust transition, not an editorial content edit:
    -- preserving products.updated_at avoids invalidating an unrelated revision.
    update public.products set verification_summary = normalized_summary
    where id = target_product.id;
  end if;

  insert into public.moderation_decisions (entity_type, entity_id, decision, rationale, reviewer_id)
  values ('product_evidence', target_evidence.id, requested_decision, normalized_rationale, current_user_id);
end;
$$;

revoke all on function public.register_evidence_document(uuid, text, integer, text) from public;
revoke all on function public.discard_evidence_document(uuid) from public;
revoke all on function public.require_evidence_document_for_approval() from public;
revoke all on function public.require_reviewable_evidence_document_on_submission() from public;
revoke all on function public.review_published_product_evidence(uuid, text, text, text) from public;
grant execute on function public.register_evidence_document(uuid, text, integer, text) to authenticated;
grant execute on function public.discard_evidence_document(uuid) to authenticated;
grant execute on function public.review_published_product_evidence(uuid, text, text, text) to authenticated;
