begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

select has_table(
  'private',
  'operator_mfa_policy',
  'operator MFA rollout policy exists outside exposed schemas'
);
select has_function(
  'public',
  'set_operator_aal2_enforcement',
  array['boolean', 'text'],
  'explicit deployment activation boundary exists'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'private.operator_mfa_policy',
    'SELECT'
  ),
  'clients cannot inspect the private rollout switch'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.set_operator_aal2_enforcement(boolean,text)',
    'EXECUTE'
  ),
  'clients cannot weaken or activate the database MFA policy'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'c0000000-0000-4000-8000-000000000001',
    'aal2-operator@yaqeen.local',
    '{"display_name":"AAL2 Operator"}'
  ),
  (
    'c0000000-0000-4000-8000-000000000002',
    'aal2-customer@yaqeen.local',
    '{"display_name":"AAL2 Customer"}'
  );

update public.profiles
set role = 'operator'
where id = 'c0000000-0000-4000-8000-000000000001';

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
select is(
  public.is_operator(),
  true,
  'legacy AAL1 operator remains available before explicit activation'
);
select throws_ok(
  $$ select public.set_operator_aal2_enforcement(
    true,
    'ENABLE_OPERATOR_AAL2_AFTER_TWO_ENROLLMENTS'
  ) $$,
  '42501',
  'permission denied for function set_operator_aal2_enforcement',
  'operator cannot activate their own authorization policy'
);
reset role;

set local role service_role;
select throws_ok(
  $$ select public.set_operator_aal2_enforcement(true, 'ENABLE_NOW') $$,
  '22023',
  'aal2_activation_confirmation_required',
  'deployment activation requires the exact anti-lockout confirmation'
);
select lives_ok(
  $$ select public.set_operator_aal2_enforcement(
    true,
    'ENABLE_OPERATOR_AAL2_AFTER_TWO_ENROLLMENTS'
  ) $$,
  'service role activates AAL2 after the deployment checklist'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
select is(public.is_operator(), false, 'AAL1 operator loses authority after activation');
reset role;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.is_operator(), false, 'operator token without assurance is rejected');
reset role;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
select is(public.is_operator(), true, 'verified AAL2 operator keeps authority');
reset role;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}';
select is(public.is_operator(), false, 'AAL2 does not elevate a customer');
reset role;

set local role service_role;
select lives_ok(
  $$ select public.set_operator_aal2_enforcement(false, 'ROLLBACK') $$,
  'service role can perform an emergency rollback'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
select is(public.is_operator(), true, 'rollback restores legacy operator access');
reset role;

select is(
  (select require_aal2 from private.operator_mfa_policy where singleton),
  false,
  'test leaves the rollout switch disabled'
);

select * from finish();
rollback;
