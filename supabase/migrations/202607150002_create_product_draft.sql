create or replace function public.create_product_draft(
  requested_shop_id uuid,
  requested_title text,
  requested_slug text,
  requested_description text,
  requested_category text,
  requested_variant_title text,
  requested_sku text,
  requested_price_cents integer,
  requested_stock_on_hand integer,
  requested_evidence_kind text,
  requested_evidence_scope text,
  requested_issuer_name text default null,
  requested_reference_number text default null,
  requested_public_summary text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_title text := nullif(trim(requested_title), '');
  normalized_slug text := lower(nullif(trim(requested_slug), ''));
  normalized_description text := nullif(trim(requested_description), '');
  normalized_category text := lower(nullif(trim(requested_category), ''));
  normalized_variant_title text := nullif(trim(requested_variant_title), '');
  normalized_sku text := upper(nullif(trim(requested_sku), ''));
  normalized_evidence_scope text := nullif(trim(requested_evidence_scope), '');
  normalized_issuer_name text := nullif(trim(requested_issuer_name), '');
  normalized_reference_number text := nullif(trim(requested_reference_number), '');
  normalized_public_summary text := nullif(trim(requested_public_summary), '');
  created_product_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if requested_shop_id is null or not public.is_shop_member(requested_shop_id) then
    raise exception using errcode = '42501', message = 'shop_membership_required';
  end if;

  if normalized_title is null or char_length(normalized_title) not between 2 and 180 then
    raise exception using errcode = '22023', message = 'invalid_product_title';
  end if;

  if normalized_slug is null or char_length(normalized_slug) not between 3 and 100
    or normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'invalid_product_slug';
  end if;

  if normalized_description is not null and char_length(normalized_description) > 5000 then
    raise exception using errcode = '22023', message = 'invalid_product_description';
  end if;

  if normalized_category is null or normalized_category <> all(array[
    'parfums', 'cosmetiques', 'livres', 'mode', 'bien-etre', 'complements', 'maison'
  ]) then
    raise exception using errcode = '22023', message = 'invalid_product_category';
  end if;

  if normalized_variant_title is null or char_length(normalized_variant_title) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'invalid_variant_title';
  end if;

  if normalized_sku is null or char_length(normalized_sku) not between 3 and 64
    or normalized_sku !~ '^[A-Z0-9][A-Z0-9._-]+$' then
    raise exception using errcode = '22023', message = 'invalid_sku';
  end if;

  if requested_price_cents is null or requested_price_cents not between 1 and 10000000 then
    raise exception using errcode = '22023', message = 'invalid_price';
  end if;

  if requested_stock_on_hand is null or requested_stock_on_hand not between 0 and 1000000 then
    raise exception using errcode = '22023', message = 'invalid_stock';
  end if;

  if requested_evidence_kind is null or requested_evidence_kind not in ('seller_declaration', 'third_party_certificate') then
    raise exception using errcode = '22023', message = 'invalid_evidence_kind';
  end if;

  if normalized_evidence_scope is null or char_length(normalized_evidence_scope) not between 10 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_evidence_scope';
  end if;

  if requested_evidence_kind = 'third_party_certificate'
    and (normalized_issuer_name is null or normalized_reference_number is null) then
    raise exception using errcode = '22023', message = 'certificate_details_required';
  end if;

  if (normalized_issuer_name is not null and char_length(normalized_issuer_name) > 180)
    or (normalized_reference_number is not null and char_length(normalized_reference_number) > 180)
    or (normalized_public_summary is not null and char_length(normalized_public_summary) > 1000) then
    raise exception using errcode = '22023', message = 'invalid_evidence_details';
  end if;

  insert into public.products (shop_id, slug, title, description, category, status)
  values (requested_shop_id, normalized_slug, normalized_title, normalized_description, normalized_category, 'draft')
  returning id into created_product_id;

  insert into public.product_variants (product_id, sku, title, price_cents, currency, stock_on_hand, stock_reserved, active)
  values (created_product_id, normalized_sku, normalized_variant_title, requested_price_cents, 'EUR', requested_stock_on_hand, 0, true);

  insert into public.product_evidence (
    product_id, kind, status, issuer_name, reference_number, scope, public_summary, submitted_by
  ) values (
    created_product_id,
    requested_evidence_kind::public.evidence_kind,
    'pending',
    normalized_issuer_name,
    normalized_reference_number,
    normalized_evidence_scope,
    normalized_public_summary,
    current_user_id
  );

  return created_product_id;
end;
$$;

revoke all on function public.create_product_draft(uuid, text, text, text, text, text, text, integer, integer, text, text, text, text, text) from public;
grant execute on function public.create_product_draft(uuid, text, text, text, text, text, text, integer, integer, text, text, text, text, text) to authenticated;
