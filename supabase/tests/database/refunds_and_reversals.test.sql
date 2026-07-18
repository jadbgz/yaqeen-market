begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(42);

select has_table('public','payment_refunds','refund ledger exists');
select has_table('public','payment_transfer_reversals','transfer reversal ledger exists');
select has_type('public','payment_refund_status','refund status enum exists');
select has_function('public','request_shop_order_refund',array['uuid','text','text','text'],'operator refund boundary exists');
select has_function('public','apply_stripe_refund_state',array['uuid','text','text','bigint','text','text'],'webhook refund boundary exists');
select has_function('public','prepare_transfer_reversal',array['uuid','text'],'reversal preparation boundary exists');
select policies_are('public','payment_refunds',array['payment_refunds_party_read']);
select policies_are('public','payment_transfer_reversals',array['payment_transfer_reversals_operator_read']);
select ok(has_function_privilege('authenticated','public.request_shop_order_refund(uuid,text,text,text)','EXECUTE'),'authenticated operator reaches request boundary');
select ok(not has_function_privilege('authenticated','public.apply_stripe_refund_state(uuid,text,text,bigint,text,text)','EXECUTE'),'clients cannot forge Stripe refund state');
select ok(has_function_privilege('service_role','public.apply_stripe_refund_state(uuid,text,text,bigint,text,text)','EXECUTE'),'trusted webhook can apply refund state');
select ok(not has_table_privilege('authenticated','public.payment_refunds','INSERT'),'clients cannot forge refund rows');
select ok(not has_table_privilege('authenticated','public.payment_transfer_reversals','INSERT'),'clients cannot forge reversal rows');

insert into auth.users(id,email,raw_user_meta_data) values
('70000000-0000-4000-8000-000000000001','refund-seller-a@yaqeen.local','{"display_name":"Seller A"}'),
('70000000-0000-4000-8000-000000000002','refund-seller-b@yaqeen.local','{"display_name":"Seller B"}'),
('70000000-0000-4000-8000-000000000003','refund-customer@yaqeen.local','{"display_name":"Customer"}'),
('70000000-0000-4000-8000-000000000004','refund-operator@yaqeen.local','{"display_name":"Operator"}'),
('70000000-0000-4000-8000-000000000005','refund-outsider@yaqeen.local','{"display_name":"Outsider"}');
update public.profiles set role='seller' where id in ('70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002');
update public.profiles set role='operator' where id='70000000-0000-4000-8000-000000000004';
insert into public.shops(id,owner_id,slug,name,description,status,ships_from_country) values
('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','refund-a','Refund A','Boutique A du test remboursement.','approved','FR'),
('71000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','refund-b','Refund B','Boutique B du test remboursement.','approved','FR');
insert into public.shop_members(shop_id,user_id,member_role) values
('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','owner'),
('71000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','owner');
insert into public.shop_payment_accounts(shop_id,provider_account_id,status,transfers_enabled,connected_at,last_synced_at) values
('71000000-0000-4000-8000-000000000001','acct_RefundShopA1','enabled',true,now(),now()),
('71000000-0000-4000-8000-000000000002','acct_RefundShopB2','enabled',true,now(),now());
insert into public.orders(id,customer_id,checkout_token,status,currency,subtotal_cents,shipping_cents,total_cents,expires_at,paid_at) values
('72000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003','72100000-0000-4000-8000-000000000001','delivered','EUR',7000,0,7000,now()+interval '15 minutes',now());
insert into public.shop_orders(id,order_id,shop_id,status,currency,subtotal_cents,shipping_cents,commission_cents,total_cents,tracking_number,shipping_carrier,shipped_at,delivered_at) values
('73000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','delivered','EUR',4000,0,400,4000,'REFUND-A-TRACK','Colissimo',now(),now()),
('73000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','delivered','EUR',3000,0,300,3000,'REFUND-B-TRACK','Chronopost',now(),now());
insert into public.payment_attempts(id,order_id,attempt_number,provider_payment_intent_id,provider_charge_id,idempotency_key,status,amount_cents,currency,succeeded_at) values
('74000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001',1,'pi_RefundAttempt01','ch_RefundCharge01','payment:refund:test:attempt:01','succeeded',7000,'EUR',now());
insert into public.payment_transfers(id,payment_attempt_id,shop_order_id,shop_id,provider_transfer_id,idempotency_key,status,gross_cents,commission_cents,transfer_cents,currency,submitted_at) values
('75000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','tr_RefundTransfer01','transfer:refund:test:shop:a:v1','submitted',4000,400,3600,'EUR',now());

set local role authenticated;
set local "request.jwt.claims"='{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select public.request_shop_order_refund('73000000-0000-4000-8000-000000000001','requested_by_customer','Demande vendeur interdite.','refund:shop:a:full:operator:v1')$$,'42501','operator_required','seller cannot refund their own order');
select is((select count(*)::bigint from public.payment_refunds),0::bigint,'seller sees no refund before request');
reset role;

set local role authenticated;
set local "request.jwt.claims"='{"sub":"70000000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok($$select public.request_shop_order_refund('73000000-0000-4000-8000-000000000001','other','Motif interne suffisamment détaillé.','refund:shop:a:full:operator:v1')$$,'22023','invalid_refund_reason','unknown refund reason is rejected');
select throws_ok($$select public.request_shop_order_refund('73000000-0000-4000-8000-000000000001','requested_by_customer','court','refund:shop:a:full:operator:v1')$$,'22023','invalid_refund_rationale','short rationale is rejected');
select lives_ok($$select public.request_shop_order_refund('73000000-0000-4000-8000-000000000001','requested_by_customer','Demande client vérifiée par le support Yaqeen.','refund:shop:a:full:operator:v1')$$,'operator prepares full shop refund');
select ok((select amount_cents=4000 and currency='EUR' and status='prepared' from public.payment_refunds where shop_order_id='73000000-0000-4000-8000-000000000001'),'refund amount is frozen from shop order');
select lives_ok($$select public.request_shop_order_refund('73000000-0000-4000-8000-000000000001','requested_by_customer','Demande client vérifiée par le support Yaqeen.','refund:shop:a:full:operator:v1')$$,'identical refund request is idempotent');
select throws_ok($$select public.request_shop_order_refund('73000000-0000-4000-8000-000000000001','requested_by_customer','Une autre justification ne remplace pas la preuve.','refund:shop:a:full:operator:v1')$$,'23505','refund_request_conflict','audit rationale cannot be silently replaced');
reset role;

set local role service_role;
select throws_ok($$select public.attach_stripe_refund((select id from public.payment_refunds where shop_order_id='73000000-0000-4000-8000-000000000001'),'bad')$$,'22023','invalid_stripe_refund_id','malformed refund identity is rejected');
select is(public.attach_stripe_refund((select id from public.payment_refunds where shop_order_id='73000000-0000-4000-8000-000000000001'),'re_RefundShopOrderA1'),'submitted','Stripe refund identity is attached');
select throws_ok($$select public.apply_stripe_refund_state((select id from public.payment_refunds where shop_order_id='73000000-0000-4000-8000-000000000001'),'re_RefundShopOrderA1','succeeded',3999,'EUR',null)$$,'23514','stripe_refund_reconciliation_failed','refund amount mismatch is blocked');
select is(public.apply_stripe_refund_state((select id from public.payment_refunds where shop_order_id='73000000-0000-4000-8000-000000000001'),'re_RefundShopOrderA1','pending',4000,'eur',null),'pending','pending webhook state is retained');
select is(public.apply_stripe_refund_state((select id from public.payment_refunds where shop_order_id='73000000-0000-4000-8000-000000000001'),'re_RefundShopOrderA1','succeeded',4000,'EUR',null),'succeeded','successful refund is applied');
reset role;
select ok((select status='refunded' and tracking_number='REFUND-A-TRACK' and delivered_at is not null from public.shop_orders where id='73000000-0000-4000-8000-000000000001'),'refund preserves shipment and delivery evidence');
select is((select status::text from public.orders where id='72000000-0000-4000-8000-000000000001'),'partially_refunded','one seller refund makes aggregate partially refunded');
select is((select count(*)::bigint from public.order_events where entity_id='73000000-0000-4000-8000-000000000001' and reason='stripe_refund_succeeded'),1::bigint,'refund transition is audited once');
set local role service_role;
select ok((select reversal_amount_cents=3600 and reversal_currency='EUR' and provider_transfer_id='tr_RefundTransfer01' from public.prepare_transfer_reversal((select id from public.payment_refunds where shop_order_id='73000000-0000-4000-8000-000000000001'),'reversal:refund:shop:a:full:v1')),'reversal recovers only seller net');
select throws_ok($$select public.complete_transfer_reversal((select id from public.payment_transfer_reversals limit 1),'trr_RefundReversalA1',3500,'EUR')$$,'23514','stripe_reversal_reconciliation_failed','reversal amount mismatch is blocked');
select is(public.complete_transfer_reversal((select id from public.payment_transfer_reversals limit 1),'trr_RefundReversalA1',3600,'eur'),'submitted','verified reversal is submitted');
reset role;
select ok((select status='reversed' and reversed_cents=3600 and reversed_at is not null from public.payment_transfers where id='75000000-0000-4000-8000-000000000001'),'seller transfer is fully reversed');
set local role service_role;
select is(public.complete_transfer_reversal((select id from public.payment_transfer_reversals limit 1),'trr_RefundReversalA1',3600,'EUR'),'duplicate','reversal replay is idempotent');
reset role;

set local role authenticated;
set local "request.jwt.claims"='{"sub":"70000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok($$select public.request_shop_order_refund('73000000-0000-4000-8000-000000000002','duplicate','Paiement dupliqué confirmé par rapprochement.','refund:shop:b:full:operator:v1')$$,'second shop refund is prepared');
reset role;
set local role service_role;
select is(public.apply_stripe_refund_state((select id from public.payment_refunds where shop_order_id='73000000-0000-4000-8000-000000000002'),'re_RefundShopOrderB2','succeeded',3000,'EUR',null),'succeeded','second shop refund succeeds even without prior attach');
select is((select count(*)::bigint from public.prepare_transfer_reversal((select id from public.payment_refunds where shop_order_id='73000000-0000-4000-8000-000000000002'),'reversal:refund:shop:b:full:v1')),0::bigint,'no reversal is created when seller funds were never released');
reset role;
select is((select status::text from public.orders where id='72000000-0000-4000-8000-000000000001'),'refunded','all seller refunds make aggregate fully refunded');

set local role authenticated;
set local "request.jwt.claims"='{"sub":"70000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::bigint from public.payment_refunds),2::bigint,'customer can read refunds for their order');
select is((select count(*)::bigint from public.payment_transfer_reversals),0::bigint,'customer cannot read internal reversals');
reset role;
set local role authenticated;
set local "request.jwt.claims"='{"sub":"70000000-0000-4000-8000-000000000005","role":"authenticated"}';
select is((select count(*)::bigint from public.payment_refunds),0::bigint,'outsider cannot read refunds');
select is((select count(*)::bigint from public.payment_transfer_reversals),0::bigint,'outsider cannot read reversals');
reset role;

select * from finish();
rollback;
