alter table public.payment_attempts
  add column provider_charge_id text unique,
  add constraint payment_attempts_provider_charge_id_check
    check (provider_charge_id is null or provider_charge_id ~ '^ch_[A-Za-z0-9]{8,}$');

create or replace function public.enforce_payment_attempt_seller_readiness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.shop_orders so
    left join public.shop_payment_accounts spa on spa.shop_id = so.shop_id
    where so.order_id = new.order_id
      and (
        spa.shop_id is null
        or spa.status <> 'enabled'
        or not spa.transfers_enabled
        or spa.provider_account_id is null
      )
  ) then
    raise exception using errcode = '55000', message = 'seller_payment_account_required';
  end if;
  return new;
end;
$$;

create trigger payment_attempts_require_ready_sellers
before insert on public.payment_attempts
for each row execute function public.enforce_payment_attempt_seller_readiness();

revoke all on function public.enforce_payment_attempt_seller_readiness() from public;

create or replace function public.apply_stripe_payment_intent_state(
  requested_provider_payment_intent_id text,
  requested_status text,
  requested_amount_cents bigint,
  requested_currency text,
  requested_provider_charge_id text default null,
  requested_last_error_code text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_intent_id text := nullif(trim(requested_provider_payment_intent_id), '');
  normalized_currency text := upper(nullif(trim(requested_currency), ''));
  normalized_charge_id text := nullif(trim(requested_provider_charge_id), '');
  normalized_error_code text := nullif(trim(requested_last_error_code), '');
  target_attempt record;
  target_reservation record;
begin
  if normalized_intent_id is null or normalized_intent_id !~ '^pi_[A-Za-z0-9]{8,}$' then
    raise exception using errcode = '22023', message = 'invalid_stripe_payment_intent_id';
  end if;
  if requested_status not in (
    'requires_payment_method', 'requires_action', 'processing', 'succeeded', 'cancelled'
  ) then
    raise exception using errcode = '22023', message = 'invalid_stripe_payment_status';
  end if;
  if requested_amount_cents is null or requested_amount_cents <= 0
    or normalized_currency is null or normalized_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode = '22023', message = 'invalid_stripe_payment_amount';
  end if;
  if normalized_charge_id is not null and normalized_charge_id !~ '^ch_[A-Za-z0-9]{8,}$' then
    raise exception using errcode = '22023', message = 'invalid_stripe_charge_id';
  end if;
  if normalized_error_code is not null and char_length(normalized_error_code) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'invalid_stripe_error_code';
  end if;

  select
    pa.id as attempt_id,
    pa.order_id,
    pa.status as attempt_status,
    pa.amount_cents,
    pa.currency,
    pa.provider_charge_id,
    o.status as order_status
  into target_attempt
  from public.payment_attempts pa
  join public.orders o on o.id = pa.order_id
  where pa.provider_payment_intent_id = normalized_intent_id
  for update of pa, o;

  if not found then
    raise exception using errcode = 'P0002', message = 'payment_attempt_not_found';
  end if;
  if target_attempt.amount_cents <> requested_amount_cents
    or target_attempt.currency <> normalized_currency then
    raise exception using errcode = '23514', message = 'stripe_payment_amount_mismatch';
  end if;

  if requested_status = 'succeeded' then
    if normalized_charge_id is null then
      raise exception using errcode = '22023', message = 'succeeded_payment_requires_charge';
    end if;
    if target_attempt.attempt_status = 'succeeded' then
      if target_attempt.provider_charge_id <> normalized_charge_id then
        raise exception using errcode = '23514', message = 'stripe_charge_identity_conflict';
      end if;
      return 'duplicate';
    end if;
    if target_attempt.attempt_status = 'cancelled' or target_attempt.order_status <> 'pending_payment' then
      raise exception using errcode = '55000', message = 'paid_order_not_open';
    end if;
    if not exists (
      select 1 from public.inventory_reservations
      where order_id = target_attempt.order_id and status = 'active'
    ) or exists (
      select 1 from public.inventory_reservations
      where order_id = target_attempt.order_id and status <> 'active'
    ) then
      raise exception using errcode = '55000', message = 'active_reservations_required';
    end if;

    for target_reservation in
      select id, variant_id, quantity
      from public.inventory_reservations
      where order_id = target_attempt.order_id and status = 'active'
      order by variant_id
      for update
    loop
      update public.product_variants
      set stock_on_hand = stock_on_hand - target_reservation.quantity,
          stock_reserved = stock_reserved - target_reservation.quantity,
          updated_at = now()
      where id = target_reservation.variant_id
        and stock_on_hand >= target_reservation.quantity
        and stock_reserved >= target_reservation.quantity;

      if not found then
        raise exception using errcode = '23514', message = 'stock_reservation_invariant_failed';
      end if;

      update public.inventory_reservations
      set status = 'consumed'
      where id = target_reservation.id;
    end loop;

    insert into public.order_events (entity_type, entity_id, actor_id, from_status, to_status, reason)
    select 'shop_order', id, null, status::text, 'paid', 'stripe_payment_intent_succeeded'
    from public.shop_orders
    where order_id = target_attempt.order_id and status = 'pending_payment';

    update public.shop_orders
    set status = 'paid', updated_at = now()
    where order_id = target_attempt.order_id and status = 'pending_payment';

    insert into public.order_events (entity_type, entity_id, actor_id, from_status, to_status, reason)
    values (
      'order', target_attempt.order_id, null, target_attempt.order_status::text,
      'paid', 'stripe_payment_intent_succeeded'
    );

    update public.orders
    set status = 'paid', paid_at = now(), updated_at = now()
    where id = target_attempt.order_id;

    update public.payment_attempts
    set status = 'succeeded',
        provider_charge_id = normalized_charge_id,
        last_error_code = null,
        succeeded_at = now(),
        cancelled_at = null,
        updated_at = now()
    where id = target_attempt.attempt_id;
    return 'paid';
  end if;

  if requested_status = 'cancelled' then
    if target_attempt.attempt_status = 'succeeded' then return 'stale'; end if;
    if target_attempt.attempt_status = 'cancelled' then return 'duplicate'; end if;

    for target_reservation in
      select id, variant_id, quantity
      from public.inventory_reservations
      where order_id = target_attempt.order_id and status = 'active'
      order by variant_id
      for update
    loop
      update public.product_variants
      set stock_reserved = stock_reserved - target_reservation.quantity,
          updated_at = now()
      where id = target_reservation.variant_id
        and stock_reserved >= target_reservation.quantity;
      if not found then
        raise exception using errcode = '23514', message = 'stock_reservation_invariant_failed';
      end if;
      update public.inventory_reservations
      set status = 'released', released_at = now()
      where id = target_reservation.id;
    end loop;

    if target_attempt.order_status = 'pending_payment' then
      insert into public.order_events (entity_type, entity_id, actor_id, from_status, to_status, reason)
      select 'shop_order', id, null, status::text, 'cancelled', 'stripe_payment_intent_cancelled'
      from public.shop_orders
      where order_id = target_attempt.order_id and status = 'pending_payment';
      update public.shop_orders set status = 'cancelled', updated_at = now()
      where order_id = target_attempt.order_id and status = 'pending_payment';
      insert into public.order_events (entity_type, entity_id, actor_id, from_status, to_status, reason)
      values (
        'order', target_attempt.order_id, null, target_attempt.order_status::text,
        'cancelled', 'stripe_payment_intent_cancelled'
      );
      update public.orders set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where id = target_attempt.order_id;
    end if;

    update public.payment_attempts
    set status = 'cancelled', cancelled_at = now(), last_error_code = normalized_error_code,
        updated_at = now()
    where id = target_attempt.attempt_id;
    return 'cancelled';
  end if;

  if target_attempt.attempt_status in ('succeeded', 'cancelled')
    or target_attempt.order_status <> 'pending_payment' then
    return 'stale';
  end if;

  update public.payment_attempts
  set status = requested_status::public.payment_attempt_status,
      last_error_code = normalized_error_code,
      updated_at = now()
  where id = target_attempt.attempt_id;
  return requested_status;
end;
$$;

revoke all on function public.apply_stripe_payment_intent_state(text,text,bigint,text,text,text) from public;
grant execute on function public.apply_stripe_payment_intent_state(text,text,bigint,text,text,text) to service_role;

comment on function public.apply_stripe_payment_intent_state(text,text,bigint,text,text,text) is
  'Trusted webhook boundary. Verifies the Stripe snapshot and consumes reserved stock atomically on success.';
