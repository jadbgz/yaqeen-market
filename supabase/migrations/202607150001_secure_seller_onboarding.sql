create unique index shops_owner_unique_idx on public.shops(owner_id);

create or replace function public.create_seller_shop(
  requested_name text,
  requested_slug text,
  requested_description text default null,
  requested_country text default 'FR'
)
returns public.shops
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_name text := trim(requested_name);
  normalized_slug text := lower(trim(requested_slug));
  normalized_description text := nullif(trim(requested_description), '');
  normalized_country text := upper(trim(requested_country));
  created_shop public.shops;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if char_length(normalized_name) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'invalid_shop_name';
  end if;

  if char_length(normalized_slug) not between 3 and 80
    or normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'invalid_shop_slug';
  end if;

  if normalized_description is not null and char_length(normalized_description) > 2000 then
    raise exception using errcode = '22023', message = 'invalid_shop_description';
  end if;

  if normalized_country !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'invalid_country_code';
  end if;

  if exists (select 1 from public.shops where owner_id = current_user_id) then
    raise exception using errcode = '23505', message = 'shop_owner_already_exists';
  end if;

  insert into public.shops (owner_id, slug, name, description, ships_from_country)
  values (current_user_id, normalized_slug, normalized_name, normalized_description, normalized_country)
  returning * into created_shop;

  insert into public.shop_members (shop_id, user_id, member_role)
  values (created_shop.id, current_user_id, 'owner');

  update public.profiles
  set role = case when role = 'customer' then 'seller' else role end,
      updated_at = now()
  where id = current_user_id;

  return created_shop;
end;
$$;

revoke all on function public.create_seller_shop(text, text, text, text) from public;
grant execute on function public.create_seller_shop(text, text, text, text) to authenticated;
