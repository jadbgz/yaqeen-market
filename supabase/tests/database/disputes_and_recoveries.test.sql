begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

select has_table('public','payment_disputes','dispute ledger exists');
select has_table('public','payment_dispute_events','dispute event journal exists');
select has_table('public','payment_dispute_transfer_recoveries','seller recovery ledger exists');
select has_type('public','payment_dispute_status','Stripe dispute states are typed');
select has_function('public','apply_stripe_dispute_snapshot',array['text','text','text','text','text','text','text','bigint','text','bigint','boolean','boolean','integer','boolean','bigint'],'signed webhook dispute boundary exists');
select has_function('public','prepare_dispute_transfer_recoveries',array['uuid'],'full-dispute recovery boundary exists');
select has_function('public','payment_attempt_has_transfer_hold',array['uuid'],'transfer hold predicate exists');
select policies_are('public','payment_disputes',array['payment_disputes_operator_read']);
select policies_are('public','payment_dispute_events',array['payment_dispute_events_operator_read']);
select policies_are('public','payment_dispute_transfer_recoveries',array['payment_dispute_recoveries_operator_read']);
select ok(has_function_privilege('service_role','public.apply_stripe_dispute_snapshot(text,text,text,text,text,text,text,bigint,text,bigint,boolean,boolean,integer,boolean,bigint)','EXECUTE'),'service webhook can apply disputes');
select ok(not has_function_privilege('authenticated','public.apply_stripe_dispute_snapshot(text,text,text,text,text,text,text,bigint,text,bigint,boolean,boolean,integer,boolean,bigint)','EXECUTE'),'clients cannot forge disputes');
select ok(not has_table_privilege('authenticated','public.payment_disputes','INSERT'),'clients cannot forge dispute rows');
select ok(not has_table_privilege('authenticated','public.payment_dispute_transfer_recoveries','INSERT'),'clients cannot forge recovery rows');

insert into auth.users(id,email,raw_user_meta_data) values
('80000000-0000-4000-8000-000000000001','dispute-seller-a@yaqeen.local','{"display_name":"Seller A"}'),
('80000000-0000-4000-8000-000000000002','dispute-seller-b@yaqeen.local','{"display_name":"Seller B"}'),
('80000000-0000-4000-8000-000000000003','dispute-customer@yaqeen.local','{"display_name":"Customer"}'),
('80000000-0000-4000-8000-000000000004','dispute-operator@yaqeen.local','{"display_name":"Operator"}'),
('80000000-0000-4000-8000-000000000005','dispute-outsider@yaqeen.local','{"display_name":"Outsider"}');
update public.profiles set role='seller' where id in ('80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002');
update public.profiles set role='operator' where id='80000000-0000-4000-8000-000000000004';
insert into public.shops(id,owner_id,slug,name,description,status,ships_from_country) values
('81000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','dispute-a','Dispute A','Boutique A du test litige.','approved','FR'),
('81000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002','dispute-b','Dispute B','Boutique B du test litige.','approved','FR');
insert into public.shop_members(shop_id,user_id,member_role) values
('81000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','owner'),
('81000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002','owner');
insert into public.shop_payment_accounts(shop_id,provider_account_id,status,transfers_enabled,connected_at,last_synced_at) values
('81000000-0000-4000-8000-000000000001','acct_DisputeShopA1','enabled',true,now(),now()),
('81000000-0000-4000-8000-000000000002','acct_DisputeShopB2','enabled',true,now(),now());
insert into public.orders(id,customer_id,checkout_token,status,currency,subtotal_cents,shipping_cents,total_cents,expires_at,paid_at) values
('82000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000003','82100000-0000-4000-8000-000000000001','delivered','EUR',10000,0,10000,now()+interval '15 minutes',now());
insert into public.shop_orders(id,order_id,shop_id,status,currency,subtotal_cents,shipping_cents,commission_cents,total_cents,tracking_number,shipping_carrier,shipped_at,delivered_at) values
('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','delivered','EUR',6000,0,600,6000,'DISPUTE-A-TRACK','Colissimo',now(),now()),
('83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','delivered','EUR',4000,0,400,4000,'DISPUTE-B-TRACK','Chronopost',now(),now());
insert into public.payment_attempts(id,order_id,attempt_number,provider_payment_intent_id,provider_charge_id,idempotency_key,status,amount_cents,currency,succeeded_at) values
('84000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',1,'pi_DisputeAttempt01','ch_DisputeCharge01','payment:dispute:test:attempt:01','succeeded',10000,'EUR',now());
insert into public.payment_transfers(id,payment_attempt_id,shop_order_id,shop_id,provider_transfer_id,idempotency_key,status,gross_cents,commission_cents,transfer_cents,currency,submitted_at) values
('85000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','tr_DisputeTransferA1','transfer:dispute:test:shop:a:v1','submitted',6000,600,5400,'EUR',now()),
('85000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','tr_DisputeTransferB2','transfer:dispute:test:shop:b:v1','submitted',4000,400,3600,'EUR',now());
insert into public.stripe_webhook_events(provider_event_id,event_type,object_id,livemode,payload_sha256) values
('evt_DisputeInquiry01','charge.dispute.created','du_DisputeInquiry01',false,repeat('a',64)),
('evt_DisputeInquiry02','charge.dispute.closed','du_DisputeInquiry01',false,repeat('b',64)),
('evt_DisputeCreated01','charge.dispute.created','du_DisputeFull0001',false,repeat('c',64)),
('evt_DisputeFundsOut1','charge.dispute.funds_withdrawn','du_DisputeFull0001',false,repeat('d',64)),
('evt_DisputeFundsBack','charge.dispute.funds_reinstated','du_DisputeFull0001',false,repeat('e',64)),
('evt_DisputeStaleOut','charge.dispute.funds_withdrawn','du_DisputeFull0001',false,repeat('3',64)),
('evt_DisputePartial1','charge.dispute.funds_withdrawn','du_DisputePart0001',false,repeat('f',64)),
('evt_DisputeUnknown1','charge.dispute.created','du_DisputeUnknown1',false,repeat('1',64)),
('evt_DisputeBadCurr','charge.dispute.created','du_DisputeBadCurr',false,repeat('2',64));

set local role authenticated;
set local "request.jwt.claims"='{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::bigint from public.payment_disputes),0::bigint,'seller cannot read financial dispute ledger');
reset role;

set local role service_role;
select throws_ok($$select public.apply_stripe_dispute_snapshot('bad','charge.dispute.created','du_DisputeFull0001','ch_DisputeCharge01','needs_response','none','fraudulent',10000,'EUR',2000000000,false,false,0,false,1900000000)$$,'22023','invalid_dispute_event_identity','malformed event identity is rejected');
select throws_ok($$select public.apply_stripe_dispute_snapshot('evt_DisputeUnknown1','charge.dispute.created','du_DisputeUnknown1','ch_UnknownCharge01','needs_response','none','fraudulent',10000,'EUR',2000000000,false,false,0,false,1900000000)$$,'P0002','disputed_charge_not_found','unknown charge is rejected');
select throws_ok($$select public.apply_stripe_dispute_snapshot('evt_DisputeBadCurr','charge.dispute.created','du_DisputeBadCurr','ch_DisputeCharge01','needs_response','none','fraudulent',10000,'USD',2000000000,false,false,0,false,1900000000)$$,'23514','stripe_dispute_currency_mismatch','currency mismatch is rejected');
select lives_ok($$select public.apply_stripe_dispute_snapshot('evt_DisputeInquiry01','charge.dispute.created','du_DisputeInquiry01','ch_DisputeCharge01','warning_needs_response','none','general',10000,'EUR',2000000000,false,false,0,true,1900000000)$$,'inquiry snapshot is accepted');
reset role;
select ok((select status='warning_needs_response' and funds_status='not_withdrawn' and recovery_status='held' from public.payment_disputes where provider_dispute_id='du_DisputeInquiry01'),'inquiry is held without pretending funds moved');
select is((select count(*)::bigint from public.payment_dispute_events where provider_event_id='evt_DisputeInquiry01'),1::bigint,'inquiry webhook is journaled once');
set local role service_role;
select ok(public.payment_attempt_has_transfer_hold('84000000-0000-4000-8000-000000000001'),'open inquiry freezes seller transfers');
select throws_ok($$select * from public.prepare_payment_transfer('83000000-0000-4000-8000-000000000001','transfer:dispute:test:shop:a:v1')$$,'55000','payment_dispute_hold_active','existing transfer cannot be replayed through an open hold');
select lives_ok($$select public.apply_stripe_dispute_snapshot('evt_DisputeInquiry02','charge.dispute.closed','du_DisputeInquiry01','ch_DisputeCharge01','warning_closed','none','general',10000,'EUR',null,false,false,0,true,1900000000)$$,'closed inquiry is applied');
select ok(not public.payment_attempt_has_transfer_hold('84000000-0000-4000-8000-000000000001'),'closed inquiry releases hold because no funds moved');

select lives_ok($$select public.apply_stripe_dispute_snapshot('evt_DisputeCreated01','charge.dispute.created','du_DisputeFull0001','ch_DisputeCharge01','needs_response','none','fraudulent',10000,'EUR',2000000000,false,false,0,false,1900000000)$$,'formal dispute opens');
reset role;
select ok((select funds_status='not_withdrawn' from public.payment_disputes where provider_dispute_id='du_DisputeFull0001'),'created event alone does not claim funds were withdrawn');
set local role service_role;
select ok(public.payment_attempt_has_transfer_hold('84000000-0000-4000-8000-000000000001'),'formal dispute freezes the charge');
select throws_ok($$select * from public.prepare_dispute_transfer_recoveries((select id from public.payment_disputes where provider_dispute_id='du_DisputeFull0001'))$$,'55000','dispute_funds_not_withdrawn','seller recovery waits for explicit funds withdrawal');
select lives_ok($$select public.apply_stripe_dispute_snapshot('evt_DisputeFundsOut1','charge.dispute.funds_withdrawn','du_DisputeFull0001','ch_DisputeCharge01','needs_response','withdrawn','fraudulent',10000,'EUR',2000000000,false,false,0,false,1900000000)$$,'funds withdrawal is applied');
reset role;
select ok((select funds_status='withdrawn' and recovery_status='automatic_full' from public.payment_disputes where provider_dispute_id='du_DisputeFull0001'),'full charge withdrawal selects deterministic recovery');
set local role service_role;
select is((select count(*)::bigint from public.prepare_dispute_transfer_recoveries((select id from public.payment_disputes where provider_dispute_id='du_DisputeFull0001'))),2::bigint,'one recovery is prepared per paid seller');
reset role;
select is((select sum(amount_cents)::bigint from public.payment_dispute_transfer_recoveries),9000::bigint,'recovery covers exact seller net, not platform commission');
set local role service_role;
select is((select count(*)::bigint from public.prepare_dispute_transfer_recoveries((select id from public.payment_disputes where provider_dispute_id='du_DisputeFull0001'))),2::bigint,'recovery preparation is idempotent');
select throws_ok($$select public.complete_dispute_transfer_recovery((select id from public.payment_dispute_transfer_recoveries where payment_transfer_id='85000000-0000-4000-8000-000000000001'),'bad',5400,'EUR')$$,'22023','invalid_stripe_reversal_id','malformed reversal identity is rejected');
select throws_ok($$select public.complete_dispute_transfer_recovery((select id from public.payment_dispute_transfer_recoveries where payment_transfer_id='85000000-0000-4000-8000-000000000001'),'trr_DisputeReverseA1',5399,'EUR')$$,'23514','stripe_dispute_recovery_mismatch','reversal amount mismatch is rejected');
select is(public.complete_dispute_transfer_recovery((select id from public.payment_dispute_transfer_recoveries where payment_transfer_id='85000000-0000-4000-8000-000000000001'),'trr_DisputeReverseA1',5400,'eur'),'submitted','first seller recovery completes');
select is(public.complete_dispute_transfer_recovery((select id from public.payment_dispute_transfer_recoveries where payment_transfer_id='85000000-0000-4000-8000-000000000001'),'trr_DisputeReverseA1',5400,'EUR'),'duplicate','recovery replay is idempotent');
select is(public.complete_dispute_transfer_recovery((select id from public.payment_dispute_transfer_recoveries where payment_transfer_id='85000000-0000-4000-8000-000000000002'),'trr_DisputeReverseB2',3600,'EUR'),'submitted','second seller recovery completes');
reset role;
select is((select count(*)::bigint from public.payment_transfers where status='reversed' and reversed_cents=transfer_cents),2::bigint,'all released seller nets are recovered');
select is((select recovery_status::text from public.payment_disputes where provider_dispute_id='du_DisputeFull0001'),'completed','full recovery closes platform seller exposure');
set local role service_role;
select lives_ok($$select public.apply_stripe_dispute_snapshot('evt_DisputeFundsBack','charge.dispute.funds_reinstated','du_DisputeFull0001','ch_DisputeCharge01','won','reinstated','fraudulent',10000,'EUR',null,true,false,1,false,1900000000)$$,'won dispute reinstates platform funds');
reset role;
select is((select count(*)::bigint from public.payment_dispute_transfer_recoveries where status='compensation_required'),2::bigint,'won dispute exposes every seller recompensation obligation');
select is((select recovery_status::text from public.payment_disputes where provider_dispute_id='du_DisputeFull0001'),'compensation_required','automatic seller payment is intentionally withheld for reconciliation');
set local role service_role;
select lives_ok($$select public.apply_stripe_dispute_snapshot('evt_DisputeStaleOut','charge.dispute.funds_withdrawn','du_DisputeFull0001','ch_DisputeCharge01','won','withdrawn','fraudulent',10000,'EUR',null,true,false,1,false,1900000000)$$,'late funds-withdrawn delivery is accepted idempotently');
reset role;
select is((select funds_status::text from public.payment_disputes where provider_dispute_id='du_DisputeFull0001'),'reinstated','funds state cannot regress after reinstatement');

set local role service_role;
select lives_ok($$select public.apply_stripe_dispute_snapshot('evt_DisputePartial1','charge.dispute.funds_withdrawn','du_DisputePart0001','ch_DisputeCharge01','needs_response','withdrawn','general',2500,'EUR',2000000000,false,false,0,false,1900000000)$$,'partial dispute is recorded without arbitrary seller allocation');
reset role;
select is((select recovery_status::text from public.payment_disputes where provider_dispute_id='du_DisputePart0001'),'manual_partial','partial aggregate dispute requires operator allocation');
set local role service_role;
select is((select count(*)::bigint from public.prepare_dispute_transfer_recoveries((select id from public.payment_disputes where provider_dispute_id='du_DisputePart0001'))),0::bigint,'partial dispute creates no automatic seller reversal');
reset role;

set local role authenticated;
set local "request.jwt.claims"='{"sub":"80000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::bigint from public.payment_disputes),3::bigint,'operator sees all dispute cases');
reset role;
set local role authenticated;
set local "request.jwt.claims"='{"sub":"80000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::bigint from public.payment_disputes),0::bigint,'customer cannot read internal dispute ledger');
reset role;
select is((select count(*)::bigint from public.payment_dispute_events),7::bigint,'all accepted Stripe dispute events are journaled exactly once');

select * from finish();
rollback;
