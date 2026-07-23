-- Operator MFA rolls out in two phases to avoid locking every administrator
-- out at once. The application requires AAL2 immediately; the database policy
-- is activated only after two operators have enrolled and recovery is tested.

create schema if not exists private;
revoke all on schema private from public;

create table private.operator_mfa_policy (
  singleton boolean primary key default true check (singleton),
  require_aal2 boolean not null default false,
  updated_at timestamptz not null default now(),
  check (singleton = true)
);

insert into private.operator_mfa_policy (singleton, require_aal2)
values (true, false)
on conflict (singleton) do nothing;

revoke all on table private.operator_mfa_policy from public;

create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('operator', 'admin')
  )
  and (
    not coalesce(
      (
        select require_aal2
        from private.operator_mfa_policy
        where singleton
      ),
      false
    )
    or coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
  );
$$;

create or replace function public.set_operator_aal2_enforcement(
  requested_enabled boolean,
  requested_confirmation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if requested_enabled is null then
    raise exception using errcode = '22023', message = 'aal2_policy_state_required';
  end if;
  if requested_enabled
    and requested_confirmation <> 'ENABLE_OPERATOR_AAL2_AFTER_TWO_ENROLLMENTS' then
    raise exception using errcode = '22023', message = 'aal2_activation_confirmation_required';
  end if;

  update private.operator_mfa_policy
  set require_aal2 = requested_enabled,
      updated_at = now()
  where singleton;
end;
$$;

revoke all on function public.is_operator() from public;
revoke all on function public.set_operator_aal2_enforcement(boolean, text)
  from public;

grant execute on function public.is_operator() to authenticated;
grant execute on function public.set_operator_aal2_enforcement(boolean, text)
  to service_role;

comment on table private.operator_mfa_policy is
  'Anti-lockout rollout switch for database-wide operator AAL2 enforcement.';
comment on function public.set_operator_aal2_enforcement(boolean, text) is
  'Service-role deployment boundary; enable only after two operator TOTP enrollments and a tested recovery procedure.';
