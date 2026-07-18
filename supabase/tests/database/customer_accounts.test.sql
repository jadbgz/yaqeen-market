begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(40);

select has_type('public', 'account_deletion_status', 'deletion workflow status exists');
select has_table('public', 'customer_addresses', 'customer addresses table exists');
select has_table('public', 'order_shipping_addresses', 'order delivery snapshots table exists');
select has_table('public', 'account_deletion_requests', 'account deletion queue exists');

select results_eq(
  $$ select count(*)::bigint from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in (
       'customer_addresses', 'order_shipping_addresses', 'account_deletion_requests'
     ) and c.relrowsecurity $$,
  $$ values (3::bigint) $$,
  'RLS protects all customer account tables'
);

select policies_are('public', 'customer_addresses', array['customer_addresses_owner_read']);
select policies_are('public', 'order_shipping_addresses', array['order_shipping_addresses_party_read']);
select policies_are('public', 'account_deletion_requests', array['account_deletion_owner_or_operator_read']);

select has_index('public', 'customer_addresses', 'customer_addresses_one_default_idx');
select has_index('public', 'customer_addresses', 'customer_addresses_customer_idx');
select has_index('public', 'account_deletion_requests', 'account_deletion_one_pending_idx');

select results_eq(
  $$ select has_table_privilege('authenticated', 'public.customer_addresses', 'INSERT') $$,
  $$ values (false) $$,
  'clients cannot bypass the address mutation boundary with inserts'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.customer_addresses', 'UPDATE') $$,
  $$ values (false) $$,
  'clients cannot bypass address ownership checks with updates'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.customer_addresses', 'DELETE') $$,
  $$ values (false) $$,
  'clients cannot bypass address ownership checks with deletes'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.order_shipping_addresses', 'UPDATE') $$,
  $$ values (false) $$,
  'delivery snapshots are immutable to API clients'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.account_deletion_requests', 'INSERT') $$,
  $$ values (false) $$,
  'clients cannot forge the deletion queue directly'
);

select results_eq(
  $$ select has_function_privilege('authenticated', 'public.save_customer_address(uuid,text,text,text,text,text,text,text,text,boolean)', 'EXECUTE') $$,
  $$ values (true) $$,
  'authenticated customers can call the guarded address writer'
);
select results_eq(
  $$ select has_function_privilege('authenticated', 'public.delete_customer_address(uuid)', 'EXECUTE') $$,
  $$ values (true) $$,
  'authenticated customers can call the guarded address deletion'
);
select results_eq(
  $$ select has_function_privilege('authenticated', 'public.request_account_deletion()', 'EXECUTE') $$,
  $$ values (true) $$,
  'authenticated customers can request deletion'
);
select results_eq(
  $$ select has_function_privilege('authenticated', 'public.cancel_account_deletion()', 'EXECUTE') $$,
  $$ values (true) $$,
  'authenticated customers can cancel deletion during cooling off'
);
select results_eq(
  $$ select has_function_privilege('authenticated', 'public.create_order_reservation_with_address(jsonb,uuid,uuid)', 'EXECUTE') $$,
  $$ values (true) $$,
  'checkout exposes only the address-aware reservation boundary'
);
select results_eq(
  $$ select has_function_privilege('authenticated', 'public.create_order_reservation(jsonb,uuid)', 'EXECUTE') $$,
  $$ values (false) $$,
  'the legacy addressless reservation boundary is closed'
);
select results_eq(
  $$ select has_function_privilege('anon', 'public.create_order_reservation_with_address(jsonb,uuid,uuid)', 'EXECUTE') $$,
  $$ values (false) $$,
  'anonymous visitors cannot reserve stock with an address'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('30000000-0000-0000-0000-000000000001', 'address-owner@yaqeen.local', '{"display_name":"Address Owner"}'),
  ('30000000-0000-0000-0000-000000000002', 'address-outsider@yaqeen.local', '{"display_name":"Address Outsider"}');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.save_customer_address(
    null, '  Domicile  ', '  Amina Yaqeen  ', '  12 rue de la Paix  ', '',
    '  75011  ', '  Paris  ', ' fr ', '  +33600000000  ', false
  ) $$,
  'a customer can create a normalized address'
);
reset role;

select results_eq(
  $$ select label, recipient_name, line1, line2, postal_code, city, country_code::text, phone, is_default
     from public.customer_addresses where customer_id = '30000000-0000-0000-0000-000000000001' $$,
  $$ values ('Domicile'::text, 'Amina Yaqeen'::text, '12 rue de la Paix'::text, null::text,
     '75011'::text, 'Paris'::text, 'FR'::text, '+33600000000'::text, true) $$,
  'the first address is trimmed, normalized and defaulted server-side'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.save_customer_address(
    null, 'Bureau', 'Amina Yaqeen', '8 avenue du Test', 'Étage 2',
    '69002', 'Lyon', 'FR', null, true
  ) $$,
  'a second address can become the default atomically'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from public.customer_addresses
     where customer_id = '30000000-0000-0000-0000-000000000001' and is_default $$,
  $$ values (1::bigint) $$,
  'only one default address exists per customer'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.customer_addresses $$,
  $$ values (0::bigint) $$,
  'another customer cannot read private addresses'
);
select throws_ok(
  $$ select public.save_customer_address(
    (select id from public.customer_addresses where label = 'Domicile'),
    'Vol', 'Intrus', '1 rue Interdite', null, '75001', 'Paris', 'FR', null, false
  ) $$,
  '42501', 'address_ownership_required',
  'another customer cannot rewrite an address through the RPC'
);
select throws_ok(
  $$ insert into public.customer_addresses (
    customer_id, label, recipient_name, line1, postal_code, city, country_code
  ) values (
    '30000000-0000-0000-0000-000000000002', 'Test', 'Intrus', '1 rue Test', '75001', 'Paris', 'FR'
  ) $$,
  '42501', 'permission denied for table customer_addresses',
  'direct address insertion is denied even for the caller identity'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.save_customer_address(
    null, 'X', 'A', 'B', null, '1', 'C', 'France', '1', false
  ) $$,
  '22023', 'invalid_address',
  'malformed addresses are rejected at the database boundary'
);
select lives_ok(
  $$ select public.request_account_deletion() $$,
  'a customer can enter the deletion cooling-off queue'
);
reset role;

select results_eq(
  $$ select status::text, scheduled_for >= requested_at + interval '30 days'
     from public.account_deletion_requests
     where customer_id = '30000000-0000-0000-0000-000000000001' $$,
  $$ values ('pending'::text, true) $$,
  'deletion is pending with at least thirty days of cooling off'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq(
  $$ select public.request_account_deletion() $$,
  $$ select scheduled_for from public.account_deletion_requests
     where customer_id = '30000000-0000-0000-0000-000000000001' and status = 'pending' $$,
  'replaying a deletion request is idempotent'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}';
select results_eq(
  $$ select count(*)::bigint from public.account_deletion_requests $$,
  $$ values (0::bigint) $$,
  'another customer cannot see a deletion request'
);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.cancel_account_deletion() $$,
  'the owner can cancel during cooling off'
);
reset role;
select results_eq(
  $$ select status::text, cancelled_at is not null from public.account_deletion_requests
     where customer_id = '30000000-0000-0000-0000-000000000001' $$,
  $$ values ('cancelled'::text, true) $$,
  'cancellation is timestamped and audited'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.cancel_account_deletion() $$,
  '55000', 'no_pending_deletion_request',
  'a deletion request cannot be cancelled twice'
);
select lives_ok(
  $$ select public.delete_customer_address(
    (select id from public.customer_addresses where label = 'Bureau')
  ) $$,
  'the customer can delete their current default address'
);
reset role;
select results_eq(
  $$ select label, is_default from public.customer_addresses
     where customer_id = '30000000-0000-0000-0000-000000000001' $$,
  $$ values ('Domicile'::text, true) $$,
  'deleting the default promotes the oldest remaining address'
);

select * from finish();
rollback;
