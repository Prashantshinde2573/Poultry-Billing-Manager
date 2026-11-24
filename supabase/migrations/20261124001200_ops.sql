-- PoulGo · 0012 Notifications, owner activity log, error log, Razorpay plan orders

-- ------------------------------------------------------------ notifications --
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,   -- null = platform (super admin)
  audience text not null check (audience in ('owner', 'office', 'verifiers', 'platform')),
  kind text not null,
  params jsonb not null default '{}'::jsonb,
  link text,
  created_at timestamptz not null default now()
);
create index notifications_biz on public.notifications (business_id, created_at desc);
create index notifications_platform on public.notifications (created_at desc) where business_id is null;

create table public.notification_seen (
  user_id uuid primary key references auth.users (id) on delete cascade,
  seen_at timestamptz not null default now()
);

create or replace function private.notify(p_business_id uuid, p_audience text, p_kind text, p_params jsonb, p_link text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.notifications (business_id, audience, kind, params, link) values (p_business_id, p_audience, p_kind, coalesce(p_params, '{}'::jsonb), p_link)
$$;

/** Notifications the caller may see, newest first, with the unread count. */
create or replace function public.my_notifications(p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_seen timestamptz; v_admin boolean; m record; v_items jsonb; v_unread integer;
begin
  if v_uid is null then return jsonb_build_object('items', '[]'::jsonb, 'unread', 0); end if;
  select seen_at into v_seen from public.notification_seen where user_id = v_uid;
  v_seen := coalesce(v_seen, '-infinity'::timestamptz);
  v_admin := private.is_super_admin();
  select bm.business_id, bm.role, bm.permissions into m from public.business_members bm
    join public.businesses b on b.id = bm.business_id and b.status = 'active'
    where bm.user_id = v_uid and bm.active order by (bm.role = 'owner') desc limit 1;

  with mine as (
    select n.* from public.notifications n
    where (v_admin and n.business_id is null and n.audience = 'platform')
       or (m.business_id is not null and n.business_id = m.business_id and (
            m.role = 'owner'
         or (m.role = 'staff' and n.audience = 'office')
         or (m.role = 'staff' and n.audience = 'verifiers' and coalesce((m.permissions ->> 'verify_payments')::boolean, false))))
  )
  select coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'params', x.params, 'link', x.link, 'at', x.created_at,
            'unread', x.created_at > v_seen) order by x.created_at desc)
          from (select * from mine order by created_at desc limit greatest(1, least(p_limit, 100))) x), '[]'::jsonb),
         (select count(*) from mine where created_at > v_seen)
    into v_items, v_unread;
  return jsonb_build_object('items', v_items, 'unread', v_unread);
end $$;

create or replace function public.mark_notifications_seen()
returns void language sql security definer set search_path = ''
as $$
  insert into public.notification_seen (user_id, seen_at) values (auth.uid(), now())
  on conflict (user_id) do update set seen_at = now()
$$;

-- triggers that create notifications
create or replace function private.tg_notify_payment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_party text; v_by text;
begin
  if new.status = 'PENDING_VERIFICATION' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select name into v_party from public.parties where id = new.party_id;
    select display_name into v_by from public.business_members where business_id = new.business_id and user_id = new.collected_by;
    perform private.notify(new.business_id, 'verifiers', 'COLLECTION_PENDING',
      jsonb_build_object('amount', new.amount, 'party', v_party, 'by', v_by, 'method', new.method), '/app/payments?tab=pending');
  end if;
  return new;
end $$;
create trigger zz_notify after insert or update of status on public.payments for each row execute function private.tg_notify_payment();

create or replace function private.tg_notify_delivery()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_party text; v_trip text; v_by text;
begin
  select name into v_party from public.parties where id = new.customer_id;
  select trip_no into v_trip from public.trips where id = new.trip_id;
  select display_name into v_by from public.business_members where business_id = new.business_id and user_id = new.recorded_by;
  perform private.notify(new.business_id, 'office', 'DELIVERY_' || new.status,
    jsonb_build_object('party', v_party, 'trip', v_trip, 'by', v_by, 'reason', new.reason), '/app/trips/' || new.trip_id);
  return new;
end $$;
create trigger zz_notify after insert on public.deliveries for each row execute function private.tg_notify_delivery();

create or replace function private.tg_notify_plan_payment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_plan text; v_biz text;
begin
  select name into v_plan from public.plans where id = new.plan_id;
  perform private.notify(new.business_id, 'owner', 'PLAN_RENEWED',
    jsonb_build_object('plan', v_plan, 'till', new.period_to, 'amount', new.amount), '/app/plan');
  if new.method = 'RAZORPAY' then
    select name into v_biz from public.businesses where id = new.business_id;
    perform private.notify(null, 'platform', 'PAYMENT_ONLINE', jsonb_build_object('business', v_biz, 'amount', new.amount, 'plan', v_plan), '/admin/businesses/' || new.business_id);
  end if;
  return new;
end $$;
create trigger zz_notify after insert on public.plan_payments for each row execute function private.tg_notify_plan_payment();

create or replace function private.tg_notify_lead()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.notify(null, 'platform', 'LEAD_NEW', jsonb_build_object('name', new.name, 'city', new.city, 'business', new.business_name), '/admin/leads');
  return new;
end $$;
create trigger zz_notify after insert on public.leads for each row execute function private.tg_notify_lead();

create or replace function private.tg_notify_request()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_biz text;
begin
  select name into v_biz from public.businesses where id = new.business_id;
  perform private.notify(null, 'platform', 'RENEWAL_REQUEST', jsonb_build_object('business', v_biz, 'amount', new.amount, 'months', new.months),
    '/admin/businesses/' || new.business_id || '?renew=' || new.id);
  return new;
end $$;
create trigger zz_notify after insert on public.plan_requests for each row execute function private.tg_notify_request();

-- ------------------------------------------------------------ activity log --
/** Owner's activity tracker: who did what, newest first. */
create or replace function public.business_activity(p_business_id uuid, p_before timestamptz default null, p_actor uuid default null, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_owner(p_business_id);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'at', a.created_at, 'action', a.action, 'entity', a.entity, 'entity_id', a.entity_id, 'metadata', a.metadata,
      'actor_id', a.actor, 'actor_name', coalesce(m.display_name, case when a.actor is null then 'PoulGo' else '—' end), 'actor_role', m.role)
    order by a.created_at desc, a.id desc), '[]'::jsonb)
  from (select * from public.audit_logs l
        where l.business_id = p_business_id and l.action <> 'PNL_VIEW'
          and (p_before is null or l.created_at < p_before) and (p_actor is null or l.actor = p_actor)
        order by l.created_at desc, l.id desc limit greatest(1, least(p_limit, 200))) a
  left join public.business_members m on m.business_id = p_business_id and m.user_id = a.actor);
end $$;

-- --------------------------------------------------------------- error log --
create table public.error_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null check (source in ('server', 'client', 'action')),
  message text not null,
  code text,
  path text,
  digest text,
  stack text,
  user_agent text,
  user_id uuid,
  business_id uuid,
  meta jsonb not null default '{}'::jsonb,
  resolved boolean not null default false
);
create index error_logs_created on public.error_logs (created_at desc);

/** Anyone (even signed out) can report an error; rate limited so it can't be flooded. */
create or replace function public.log_error(p jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_biz uuid;
begin
  if v_uid is not null then
    if (select count(*) from public.error_logs where user_id = v_uid and created_at > now() - interval '1 hour') >= 60 then return; end if;
    select business_id into v_biz from public.business_members where user_id = v_uid and active order by (role = 'owner') desc limit 1;
  elsif (select count(*) from public.error_logs where user_id is null and created_at > now() - interval '1 hour') >= 300 then
    return;
  end if;
  -- identical error from the same person within 2 minutes is counted, not duplicated
  update public.error_logs set meta = meta || jsonb_build_object('repeat', coalesce((meta ->> 'repeat')::int, 1) + 1), created_at = now()
  where id = (select id from public.error_logs where user_id is not distinct from v_uid and message = left(coalesce(p ->> 'message', ''), 500)
              and coalesce(path, '') = coalesce(left(p ->> 'path', 300), '') and created_at > now() - interval '2 minutes' order by id desc limit 1);
  if found then return; end if;
  insert into public.error_logs (source, message, code, path, digest, stack, user_agent, user_id, business_id, meta)
  values (case when p ->> 'source' in ('server', 'client', 'action') then p ->> 'source' else 'client' end,
    left(coalesce(nullif(p ->> 'message', ''), 'Unknown error'), 500), left(p ->> 'code', 60), left(p ->> 'path', 300), left(p ->> 'digest', 80),
    left(p ->> 'stack', 4000), left(p ->> 'user_agent', 300), v_uid, v_biz, coalesce(p -> 'meta', '{}'::jsonb));
end $$;

create or replace function public.admin_errors(p_resolved boolean default false, p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return jsonb_build_object(
    'open', (select count(*) from public.error_logs where not resolved),
    'today', (select count(*) from public.error_logs where created_at > now() - interval '24 hours'),
    'items', (select coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object('business_name', b.name, 'user_email', u.email) order by e.created_at desc), '[]'::jsonb)
      from (select * from public.error_logs where resolved = p_resolved order by created_at desc limit least(p_limit, 500)) e
      left join public.businesses b on b.id = e.business_id left join auth.users u on u.id = e.user_id));
end $$;

create or replace function public.admin_resolve_errors(p_ids bigint[] default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_super_admin();
  update public.error_logs set resolved = true where not resolved and (p_ids is null or id = any (p_ids));
end $$;

-- ---------------------------------------------------- Razorpay plan orders --
create table public.plan_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  plan_id text not null references public.plans (id),
  months integer not null check (months in (1, 6, 12)),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'INR',
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  status text not null default 'CREATED' check (status in ('CREATED', 'PAID', 'FAILED')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index plan_orders_biz on public.plan_orders (business_id, created_at desc);

/** Owner: price for a plan + period (from the database, never from the browser). */
create or replace function public.plan_quote(p_business_id uuid, p_plan_id text, p_months integer)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare p public.plans; v_amt numeric;
begin
  if not exists (select 1 from public.business_members where business_id = p_business_id and user_id = auth.uid() and role = 'owner' and active) then
    raise exception 'FORBIDDEN: owner only';
  end if;
  select * into p from public.plans where id = p_plan_id and active and public;
  if not found then raise exception 'NOT_FOUND: plan'; end if;
  v_amt := case p_months when 1 then p.monthly when 6 then p.half_yearly when 12 then p.yearly end;
  if v_amt is null or v_amt <= 0 then raise exception 'VALIDATION: this plan needs a custom price — contact us'; end if;
  return jsonb_build_object('plan_id', p.id, 'plan_name', p.name, 'months', p_months, 'amount', v_amt,
    'business_name', (select name from public.businesses where id = p_business_id));
end $$;

/** Owner: remember the Razorpay order the server just created for a quote. */
create or replace function public.attach_plan_order(p_business_id uuid, p_plan_id text, p_months integer, p_razorpay_order_id text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare q jsonb; v_id uuid;
begin
  q := public.plan_quote(p_business_id, p_plan_id, p_months);
  if p_razorpay_order_id !~ '^order_[A-Za-z0-9]{6,40}$' then raise exception 'VALIDATION: order id'; end if;
  insert into public.plan_orders (business_id, plan_id, months, amount, razorpay_order_id, created_by)
  values (p_business_id, p_plan_id, p_months, (q ->> 'amount')::numeric, p_razorpay_order_id, auth.uid())
  returning id into v_id;
  return q || jsonb_build_object('id', v_id);
end $$;

/**
 * Server only (service role): called after the payment signature or webhook was verified.
 * Idempotent — a second call for the same order does nothing.
 */
create or replace function public.system_apply_plan_order(p_razorpay_order_id text, p_razorpay_payment_id text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare o public.plan_orders; b public.businesses; v_from date; v_to date; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into o from public.plan_orders where razorpay_order_id = p_razorpay_order_id for update;
  if not found then raise exception 'NOT_FOUND: order'; end if;
  if o.status = 'PAID' then
    return jsonb_build_object('status', 'PAID', 'already', true, 'business_id', o.business_id,
      'renews_at', (select renews_at from public.businesses where id = o.business_id));
  end if;
  select * into b from public.businesses where id = o.business_id for update;
  v_from := greatest(b.renews_at, today);
  v_to := (v_from + make_interval(months => o.months))::date;
  update public.plan_orders set status = 'PAID', razorpay_payment_id = p_razorpay_payment_id, paid_at = now() where id = o.id;
  insert into public.plan_payments (business_id, plan_id, months, amount, method, reference, paid_on, period_from, period_to, note, created_by)
  values (o.business_id, o.plan_id, o.months, o.amount, 'RAZORPAY', p_razorpay_payment_id, today, v_from, v_to, 'Online payment', o.created_by);
  update public.businesses set plan_id = o.plan_id, renews_at = v_to, grace_until = null, status = 'active', updated_at = now() where id = o.business_id;
  update public.plan_requests set status = 'DONE', handled_at = now() where business_id = o.business_id and status = 'NEW';
  insert into public.audit_logs (business_id, actor, action, entity, entity_id, metadata)
  values (o.business_id, o.created_by, 'PLAN_RENEW', 'businesses', o.business_id,
    jsonb_build_object('plan', o.plan_id, 'months', o.months, 'amount', o.amount, 'to', v_to, 'via', 'razorpay', 'payment', p_razorpay_payment_id));
  return jsonb_build_object('status', 'PAID', 'business_id', o.business_id, 'renews_at', v_to);
end $$;

create or replace function public.system_fail_plan_order(p_razorpay_order_id text)
returns void language sql security definer set search_path = ''
as $$ update public.plan_orders set status = 'FAILED' where razorpay_order_id = p_razorpay_order_id and status = 'CREATED' $$;

-- ------------------------------------------------------------------ grants --
alter table public.notifications enable row level security;
alter table public.notification_seen enable row level security;
alter table public.error_logs enable row level security;
alter table public.plan_orders enable row level security;
revoke all on public.notifications, public.notification_seen, public.error_logs, public.plan_orders from anon, authenticated;

grant execute on all functions in schema public to authenticated;
revoke execute on all functions in schema public from anon, public;
revoke execute on function public.create_business(text, text, text, text) from authenticated;
revoke execute on function public.system_apply_plan_order(text, text), public.system_fail_plan_order(text) from authenticated;
grant execute on function public.system_apply_plan_order(text, text), public.system_fail_plan_order(text) to service_role;
grant execute on function public.public_plans(), public.public_platform(), public.submit_lead(jsonb), public.log_error(jsonb) to anon, authenticated;
