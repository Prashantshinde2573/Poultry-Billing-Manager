-- PoulGo · 0009 Platform: super admin, plans & subscriptions, leads, plan enforcement
-- Model (same as Restropi): no public sign-up. The super admin creates each business and its
-- owner login, sets the plan and renewal date, gives grace periods and suspends accounts.

-- ---------------------------------------------------------------- tables --
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table public.plans (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null, name_mr text, name_hi text,
  blurb text, blurb_mr text, blurb_hi text,
  monthly numeric(12,2),            -- null = "contact us"
  half_yearly numeric(12,2),
  yearly numeric(12,2),
  modules text[] not null default '{}',
  max_staff integer, max_drivers integer, max_vehicles integer,   -- null = unlimited
  features jsonb not null default '[]'::jsonb,                    -- [{en, mr, hi}] shown on the website
  highlight boolean not null default false,
  public boolean not null default true,                           -- false = internal (trial)
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- default plans (prices editable by the super admin)
insert into public.plans (id, name, name_mr, name_hi, blurb, blurb_mr, blurb_hi, monthly, half_yearly, yearly, modules, max_staff, max_drivers, max_vehicles, features, highlight, public, sort_order) values
('trial', 'Free trial', 'मोफत ट्रायल', 'मुफ़्त ट्रायल', 'Everything, for the trial period.', 'ट्रायलमध्ये सर्व सुविधा.', 'ट्रायल में सभी सुविधाएँ।',
  0, 0, 0, array['suppliers','orders','trips','expenses','pnl','reports'], 3, 3, 3, '[]', false, false, 0),
('basic', 'Basic', 'बेसिक', 'बेसिक', 'For a shop that sells on credit to traders.', 'ट्रेडर्सना उधारीवर विकणाऱ्या दुकानासाठी.', 'ट्रेडर्स को उधार पर बेचने वाली दुकान के लिए।',
  499, 2495, 4990, array['reports'], 1, 0, 0,
  '[{"en":"Customer khata with opening dues","mr":"ग्राहकांचे खाते आणि जुनी बाकी","hi":"ग्राहक खाता और पुराना बकाया"},
    {"en":"Bills by bird size and weight","mr":"पक्ष्यांच्या साइझ व वजनानुसार बिल","hi":"साइज़ और वज़न से बिल"},
    {"en":"Payments in cash, UPI, bank","mr":"रोख, UPI, बँक पेमेंट","hi":"नकद, UPI, बैंक पेमेंट"},
    {"en":"Daily WhatsApp hisab to each trader","mr":"रोजचा हिशोब WhatsApp वर","hi":"रोज़ का हिसाब WhatsApp पर"},
    {"en":"Statements as PDF / Excel","mr":"PDF / Excel स्टेटमेंट","hi":"PDF / Excel स्टेटमेंट"},
    {"en":"1 staff login","mr":"१ स्टाफ लॉगिन","hi":"1 स्टाफ लॉगिन"}]', false, true, 1),
('business', 'Business', 'बिझनेस', 'बिज़नेस', 'For traders who buy from farms and run their own trucks.', 'फार्मकडून खरेदी करून स्वतःच्या गाड्या चालवणाऱ्यांसाठी.', 'फार्म से ख़रीदकर अपनी गाड़ियाँ चलाने वालों के लिए।',
  999, 4995, 9990, array['suppliers','orders','trips','expenses','reports'], 3, 3, 3,
  '[{"en":"Everything in Basic","mr":"बेसिकमधील सर्व","hi":"बेसिक की सब सुविधाएँ"},
    {"en":"Supplier khata and purchases","mr":"पुरवठादार खाते व खरेदी","hi":"सप्लायर खाता और ख़रीद"},
    {"en":"Orders by bird size","mr":"साइझनुसार ऑर्डर","hi":"साइज़ के हिसाब से ऑर्डर"},
    {"en":"Trips, loading and driver app","mr":"ट्रिप, लोडिंग आणि ड्रायव्हर ॲप","hi":"ट्रिप, लोडिंग और ड्राइवर ऐप"},
    {"en":"Driver cash checked before it counts","mr":"ड्रायव्हरची वसुली तपासूनच जमा","hi":"ड्राइवर की वसूली जाँच के बाद जमा"},
    {"en":"Expenses and trip settlement","mr":"खर्च आणि ट्रिप हिशोब","hi":"ख़र्च और ट्रिप हिसाब"},
    {"en":"3 staff · 3 drivers · 3 vehicles","mr":"३ स्टाफ · ३ ड्रायव्हर · ३ गाड्या","hi":"3 स्टाफ · 3 ड्राइवर · 3 गाड़ियाँ"}]', true, true, 2),
('pro', 'Pro', 'प्रो', 'प्रो', 'For owners who want to know the real profit every day.', 'रोजचा खरा नफा पाहू इच्छिणाऱ्यांसाठी.', 'रोज़ का असली मुनाफ़ा देखने वालों के लिए।',
  1999, 9995, 19990, array['suppliers','orders','trips','expenses','pnl','reports'], null, null, null,
  '[{"en":"Everything in Business","mr":"बिझनेसमधील सर्व","hi":"बिज़नेस की सब सुविधाएँ"},
    {"en":"Profit & loss by day and by trip","mr":"दिवस व ट्रिपनुसार नफा-तोटा","hi":"दिन और ट्रिप के हिसाब से मुनाफ़ा"},
    {"en":"Bird cost by weighted average","mr":"सरासरी खरेदी दराने खर्च","hi":"औसत ख़रीद दर से लागत"},
    {"en":"Stock, deaths and shortage tracking","mr":"स्टॉक, मृत पक्षी, कमी","hi":"स्टॉक, मृत पक्षी, कमी"},
    {"en":"Unlimited staff, drivers, vehicles","mr":"अमर्याद स्टाफ, ड्रायव्हर, गाड्या","hi":"असीमित स्टाफ, ड्राइवर, गाड़ियाँ"},
    {"en":"Priority WhatsApp support","mr":"प्राधान्य WhatsApp सपोर्ट","hi":"प्राथमिकता WhatsApp सपोर्ट"}]', false, true, 3);

create table public.platform_settings (
  id integer primary key default 1 check (id = 1),
  brand_name text not null default 'PoulGo',
  whatsapp text, upi_id text, payee_name text, support_phone text, support_email text,
  trial_days integer not null default 14 check (trial_days between 0 and 90),
  grace_days integer not null default 5 check (grace_days between 0 and 60),
  remind_days integer not null default 7 check (remind_days between 0 and 60),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1);

alter table public.businesses
  add column plan_id text not null default 'trial' references public.plans (id) deferrable initially deferred,
  add column renews_at date not null default (current_date + 14),
  add column grace_until date,
  add column status text not null default 'active' check (status in ('active', 'suspended')),
  add column city text,
  add column owner_name text,
  add column owner_login text,
  add column admin_notes text;

create table public.plan_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  plan_id text not null references public.plans (id),
  months integer not null check (months between 0 and 60),
  amount numeric(12,2) not null check (amount >= 0),
  method text not null default 'UPI',
  reference text,
  paid_on date not null default current_date,
  period_from date not null,
  period_to date not null,
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index plan_payments_biz on public.plan_payments (business_id, paid_on desc);

create table public.plan_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  plan_id text not null references public.plans (id),
  months integer not null,
  amount numeric(12,2),
  reference text,
  note text,
  status text not null default 'NEW' check (status in ('NEW', 'DONE', 'REJECTED')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null, phone text not null, business_name text, city text, message text,
  plan_id text, lang text,
  status text not null default 'NEW' check (status in ('NEW', 'CONTACTED', 'CONVERTED', 'CLOSED')),
  notes text,
  created_at timestamptz not null default now()
);
create index leads_created on public.leads (created_at desc);

-- ------------------------------------------------------------- helpers --
create or replace function private.is_super_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.platform_admins where user_id = auth.uid()) $$;

create or replace function private.require_super_admin()
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_super_admin() then raise exception 'FORBIDDEN: super admin only'; end if;
end $$;

/** ACTIVE · GRACE · EXPIRED · SUSPENDED */
create or replace function private.plan_state(p_business_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select case
    when b.status = 'suspended' then 'SUSPENDED'
    when b.renews_at >= private.business_today(b.id) then 'ACTIVE'
    when b.grace_until is not null and b.grace_until >= private.business_today(b.id) then 'GRACE'
    else 'EXPIRED' end
  from public.businesses b where b.id = p_business_id
$$;

create or replace function private.has_module(p_business_id uuid, p_module text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(p_module = any (p.modules), false)
  from public.businesses b join public.plans p on p.id = b.plan_id where b.id = p_business_id
$$;

create or replace function private.require_module(p_business_id uuid, p_module text)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(private.has_module(p_business_id, p_module), false) then
    raise exception 'PLAN_FEATURE: this needs a higher plan' using detail = jsonb_build_object('module', p_module)::text;
  end if;
end $$;

-- A suspended business is invisible to its team (membership counts only while active).
create or replace function private.member_role(p_business_id uuid)
returns public.member_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.business_members m
  join public.businesses b on b.id = m.business_id and b.status = 'active'
  where m.business_id = p_business_id and m.user_id = auth.uid() and m.active
  limit 1
$$;

-- Expired plan = read-only: every write into business data is refused.
create or replace function private.guard_writable()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare s text;
begin
  if private.is_super_admin() then return coalesce(new, old); end if;
  s := private.plan_state(coalesce(new.business_id, old.business_id));
  if s in ('EXPIRED', 'SUSPENDED') then
    raise exception 'PLAN_LOCKED: your plan has ended — renew to continue' using detail = jsonb_build_object('state', s)::text;
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['parties','customers','suppliers','bird_sizes','bird_size_rates','vehicles','drivers','expense_categories',
    'orders','order_items','trips','trip_allocations','loading_entries','deliveries','delivery_items','bills','bill_items',
    'purchases','purchase_items','payments','ledger_transactions','expenses','stock_positions','inventory_movements',
    'cost_allocations','trip_settlements','whatsapp_share_logs','business_members']
  loop
    execute format('create trigger zz_guard_writable before insert or update on public.%I for each row execute function private.guard_writable()', t);
  end loop;
end $$;

-- Plan modules, enforced where the record is created.
create or replace function private.guard_module()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_module(new.business_id, tg_argv[0]);
  return new;
end $$;
create trigger zz_module before insert on public.suppliers for each row execute function private.guard_module('suppliers');
create trigger zz_module before insert on public.purchases for each row execute function private.guard_module('suppliers');
create trigger zz_module before insert on public.orders for each row execute function private.guard_module('orders');
create trigger zz_module before insert on public.trips for each row execute function private.guard_module('trips');
create trigger zz_module before insert on public.expenses for each row execute function private.guard_module('expenses');

-- Plan limits on logins and vehicles.
create or replace function private.guard_limits()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare p public.plans; n integer; lim integer; k text;
begin
  select pl.* into p from public.businesses b join public.plans pl on pl.id = b.plan_id where b.id = new.business_id;
  if tg_table_name = 'vehicles' then
    if not new.active or (tg_op = 'UPDATE' and old.active) then return new; end if;
    lim := p.max_vehicles; k := 'vehicles';
    select count(*) into n from public.vehicles where business_id = new.business_id and active and id <> new.id;
  else
    if not new.active or new.role = 'owner' then return new; end if;
    if tg_op = 'UPDATE' and old.active and old.role = new.role then return new; end if;
    lim := case new.role when 'staff' then p.max_staff else p.max_drivers end; k := new.role::text;
    select count(*) into n from public.business_members where business_id = new.business_id and active and role = new.role and user_id <> new.user_id;
  end if;
  if lim is not null and n >= lim then
    raise exception 'PLAN_LIMIT: your plan allows % — upgrade to add more', lim using detail = jsonb_build_object('limit', lim, 'kind', k)::text;
  end if;
  return new;
end $$;
create trigger zz_limits before insert or update on public.vehicles for each row execute function private.guard_limits();
create trigger zz_limits before insert or update on public.business_members for each row execute function private.guard_limits();

-- Business setup shared by the super admin's "add business".
create or replace function private.seed_business(v_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.bird_sizes (business_id, name, name_mr, name_hi, sort_order) values
    (v_id, 'Large', 'मोठा', 'बड़ा', 1), (v_id, 'Medium', 'मध्यम', 'मध्यम', 2), (v_id, 'Small', 'लहान', 'छोटा', 3);
  insert into public.expense_categories (business_id, name, name_mr, name_hi, is_trip_cost) values
    (v_id, 'Diesel / Fuel', 'डिझेल', 'डीज़ल', true), (v_id, 'Driver charges', 'ड्रायव्हर खर्च', 'ड्राइवर खर्च', true),
    (v_id, 'Loading / Unloading', 'लोडिंग / अनलोडिंग', 'लोडिंग / अनलोडिंग', true), (v_id, 'Toll', 'टोल', 'टोल', true),
    (v_id, 'Vehicle repair', 'गाडी दुरुस्ती', 'गाड़ी मरम्मत', true), (v_id, 'Vehicle rent', 'गाडी भाडे', 'गाड़ी किराया', true),
    (v_id, 'Shop rent', 'दुकान भाडे', 'दुकान किराया', false), (v_id, 'Salary / Wages', 'पगार', 'वेतन', false),
    (v_id, 'Electricity', 'वीज', 'बिजली', false), (v_id, 'Other', 'इतर', 'अन्य', false);
end $$;

-- Self-service business creation is closed: only the super admin creates businesses.
revoke execute on function public.create_business(text, text, text, text) from authenticated, anon, public;

-- ------------------------------------------------------- public (website) --
create or replace function public.public_plans()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'name_mr', name_mr, 'name_hi', name_hi,
    'blurb', blurb, 'blurb_mr', blurb_mr, 'blurb_hi', blurb_hi, 'monthly', monthly, 'half_yearly', half_yearly, 'yearly', yearly,
    'modules', modules, 'max_staff', max_staff, 'max_drivers', max_drivers, 'max_vehicles', max_vehicles,
    'features', features, 'highlight', highlight) order by sort_order), '[]'::jsonb)
  from public.plans where active and public
$$;

create or replace function public.public_platform()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('brand_name', brand_name, 'whatsapp', whatsapp, 'upi_id', upi_id, 'payee_name', payee_name,
    'support_phone', support_phone, 'support_email', support_email, 'trial_days', trial_days)
  from public.platform_settings where id = 1
$$;

create or replace function public.submit_lead(p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_phone text := regexp_replace(coalesce(p ->> 'phone', ''), '[^0-9+]', '', 'g'); v_id uuid;
begin
  if char_length(coalesce(trim(p ->> 'name'), '')) < 2 then raise exception 'VALIDATION: name is required'; end if;
  if char_length(regexp_replace(v_phone, '\D', '', 'g')) < 10 then raise exception 'VALIDATION: enter a valid mobile number'; end if;
  if (select count(*) from public.leads where phone = v_phone and created_at > now() - interval '1 day') >= 3 then
    raise exception 'RATE_LIMIT: we already have your request — we will call you soon';
  end if;
  if (select count(*) from public.leads where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'RATE_LIMIT: please try again in a minute';
  end if;
  insert into public.leads (name, phone, business_name, city, message, plan_id, lang)
  values (left(trim(p ->> 'name'), 80), left(v_phone, 16), left(nullif(trim(p ->> 'business_name'), ''), 120), left(nullif(trim(p ->> 'city'), ''), 60),
    left(nullif(trim(p ->> 'message'), ''), 500), left(nullif(p ->> 'plan_id', ''), 30), left(nullif(p ->> 'lang', ''), 5))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

-- ------------------------------------------------------ signed-in client --
/** The signed-in user's account: membership (even when suspended), plan and limits. */
create or replace function public.my_account()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
  if auth.uid() is null then return null; end if;
  select jsonb_build_object(
      'super_admin', private.is_super_admin(),
      'must_change_password', coalesce((select (u.raw_user_meta_data ->> 'must_change_password')::boolean from auth.users u where u.id = auth.uid()), false),
      'business_id', b.id, 'business_name', b.name, 'role', m.role, 'permissions', m.permissions, 'display_name', m.display_name,
      'settings', b.settings, 'status', b.status, 'state', private.plan_state(b.id),
      'plan', jsonb_build_object('id', p.id, 'name', p.name, 'name_mr', p.name_mr, 'name_hi', p.name_hi, 'modules', p.modules,
        'max_staff', p.max_staff, 'max_drivers', p.max_drivers, 'max_vehicles', p.max_vehicles, 'monthly', p.monthly),
      'renews_at', b.renews_at, 'grace_until', b.grace_until,
      'days_left', b.renews_at - private.business_today(b.id))
    into v
  from public.business_members m
  join public.businesses b on b.id = m.business_id
  join public.plans p on p.id = b.plan_id
  where m.user_id = auth.uid() and m.active
  order by (m.role = 'owner') desc, m.created_at
  limit 1;
  return coalesce(v, jsonb_build_object('super_admin', private.is_super_admin(), 'business_id', null));
end $$;

create or replace function public.request_plan(p_business_id uuid, p_plan_id text, p_months integer, p_reference text, p_note text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; p public.plans;
begin
  if not exists (select 1 from public.business_members where business_id = p_business_id and user_id = auth.uid() and role = 'owner' and active) then
    raise exception 'FORBIDDEN: owner only';
  end if;
  select * into p from public.plans where id = p_plan_id and active and public;
  if not found then raise exception 'NOT_FOUND: plan'; end if;
  if p_months not in (1, 6, 12) then raise exception 'VALIDATION: months'; end if;
  if (select count(*) from public.plan_requests where business_id = p_business_id and status = 'NEW') >= 3 then
    raise exception 'RATE_LIMIT: your earlier request is still pending';
  end if;
  insert into public.plan_requests (business_id, plan_id, months, amount, reference, note, created_by)
  values (p_business_id, p_plan_id, p_months, case p_months when 1 then p.monthly when 6 then p.half_yearly else p.yearly end,
    left(nullif(trim(p_reference), ''), 80), left(nullif(trim(p_note), ''), 300), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.my_plan_history(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.business_members where business_id = p_business_id and user_id = auth.uid() and role = 'owner' and active) then
    raise exception 'FORBIDDEN: owner only';
  end if;
  return jsonb_build_object(
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('paid_on', paid_on, 'plan_id', plan_id, 'months', months, 'amount', amount, 'method', method,
        'reference', reference, 'period_from', period_from, 'period_to', period_to) order by paid_on desc), '[]'::jsonb)
      from public.plan_payments where business_id = p_business_id),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'plan_id', plan_id, 'months', months, 'amount', amount, 'status', status, 'created_at', created_at)
        order by created_at desc), '[]'::jsonb) from public.plan_requests where business_id = p_business_id),
    'usage', jsonb_build_object(
      'staff', (select count(*) from public.business_members where business_id = p_business_id and active and role = 'staff'),
      'drivers', (select count(*) from public.business_members where business_id = p_business_id and active and role = 'driver'),
      'vehicles', (select count(*) from public.vehicles where business_id = p_business_id and active)));
end $$;

-- ------------------------------------------------------------ super admin --
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  perform private.require_super_admin();
  select jsonb_build_object(
    'total', count(*),
    'active', count(*) filter (where private.plan_state(b.id) = 'ACTIVE' and b.plan_id <> 'trial'),
    'trial', count(*) filter (where b.plan_id = 'trial' and private.plan_state(b.id) = 'ACTIVE'),
    'ending', count(*) filter (where private.plan_state(b.id) = 'ACTIVE' and b.renews_at <= today + 7),
    'grace', count(*) filter (where private.plan_state(b.id) = 'GRACE'),
    'expired', count(*) filter (where private.plan_state(b.id) = 'EXPIRED'),
    'suspended', count(*) filter (where b.status = 'suspended'),
    'mrr', coalesce(sum(p.monthly) filter (where private.plan_state(b.id) in ('ACTIVE', 'GRACE') and b.plan_id <> 'trial'), 0))
    into v
  from public.businesses b join public.plans p on p.id = b.plan_id;
  return v || jsonb_build_object(
    'revenue_month', (select coalesce(sum(amount), 0) from public.plan_payments where paid_on >= date_trunc('month', today)::date),
    'revenue_last_month', (select coalesce(sum(amount), 0) from public.plan_payments where paid_on >= (date_trunc('month', today) - interval '1 month')::date and paid_on < date_trunc('month', today)::date),
    'revenue_year', (select coalesce(sum(amount), 0) from public.plan_payments where paid_on >= date_trunc('year', today)::date),
    'revenue_by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'amount', a) order by m), '[]'::jsonb) from (
        select to_char(date_trunc('month', paid_on), 'YYYY-MM') m, sum(amount) a from public.plan_payments
        where paid_on >= (date_trunc('month', today) - interval '11 months')::date group by 1) x),
    'leads_new', (select count(*) from public.leads where status = 'NEW'),
    'requests_new', (select count(*) from public.plan_requests where status = 'NEW'));
end $$;

create or replace function public.admin_businesses()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'city', b.city, 'phone', b.phone, 'owner_name', b.owner_name, 'owner_login', b.owner_login,
      'plan_id', b.plan_id, 'plan_name', p.name, 'monthly', p.monthly, 'renews_at', b.renews_at, 'grace_until', b.grace_until,
      'status', b.status, 'state', private.plan_state(b.id), 'created_at', b.created_at, 'notes', b.admin_notes,
      'members', (select count(*) from public.business_members x where x.business_id = b.id and x.active),
      'customers', (select count(*) from public.parties x where x.business_id = b.id and x.is_customer),
      'last_activity', (select max(created_at) from public.audit_logs x where x.business_id = b.id),
      'requests', (select count(*) from public.plan_requests r where r.business_id = b.id and r.status = 'NEW'))
    order by b.created_at desc), '[]'::jsonb)
    from public.businesses b join public.plans p on p.id = b.plan_id);
end $$;

create or replace function public.admin_business(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return (select jsonb_build_object(
    'business', to_jsonb(b) || jsonb_build_object('state', private.plan_state(b.id), 'plan_name', p.name),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'name', m.display_name, 'active', m.active, 'login', u.email,
        'last_sign_in_at', u.last_sign_in_at) order by m.role, m.created_at), '[]'::jsonb)
      from public.business_members m left join auth.users u on u.id = m.user_id where m.business_id = b.id),
    'payments', (select coalesce(jsonb_agg(to_jsonb(x) order by x.paid_on desc, x.created_at desc), '[]'::jsonb) from public.plan_payments x where x.business_id = b.id),
    'requests', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from public.plan_requests x where x.business_id = b.id),
    'usage', jsonb_build_object(
      'customers', (select count(*) from public.parties x where x.business_id = b.id and x.is_customer),
      'suppliers', (select count(*) from public.parties x where x.business_id = b.id and x.is_supplier),
      'bills_30d', (select count(*) from public.bills x where x.business_id = b.id and x.created_at > now() - interval '30 days'),
      'trips_30d', (select count(*) from public.trips x where x.business_id = b.id and x.created_at > now() - interval '30 days'),
      'staff', (select count(*) from public.business_members x where x.business_id = b.id and x.active and x.role = 'staff'),
      'drivers', (select count(*) from public.business_members x where x.business_id = b.id and x.active and x.role = 'driver'),
      'vehicles', (select count(*) from public.vehicles x where x.business_id = b.id and x.active)))
    from public.businesses b join public.plans p on p.id = b.plan_id where b.id = p_business_id);
end $$;

/** Called by the server after it created the owner's login with the service key. */
create or replace function public.admin_create_business(p_owner uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_plan text := coalesce(nullif(p ->> 'plan_id', ''), 'trial'); v_days integer; v_months integer := coalesce((p ->> 'months')::integer, 0);
  v_renews date; v_trial integer; v_name text := trim(coalesce(p ->> 'name', '')); v_owner text := trim(coalesce(p ->> 'owner_name', ''));
begin
  perform private.require_super_admin();
  if char_length(v_name) < 2 then raise exception 'VALIDATION: business name is required'; end if;
  if char_length(v_owner) < 2 then raise exception 'VALIDATION: owner name is required'; end if;
  if not exists (select 1 from auth.users where id = p_owner) then raise exception 'NOT_FOUND: owner login'; end if;
  if exists (select 1 from public.business_members where user_id = p_owner and active) then raise exception 'CONFLICT: this login already belongs to a business'; end if;
  if not exists (select 1 from public.plans where id = v_plan) then raise exception 'NOT_FOUND: plan'; end if;
  select trial_days into v_trial from public.platform_settings where id = 1;
  v_days := coalesce((p ->> 'trial_days')::integer, v_trial);
  v_renews := (now() at time zone 'Asia/Kolkata')::date + case when v_plan = 'trial' then v_days else 0 end;
  if v_plan <> 'trial' then v_renews := (v_renews + make_interval(months => greatest(v_months, 1)))::date; end if;

  insert into public.businesses (name, phone, address, city, owner_name, owner_login, plan_id, renews_at, admin_notes, created_by)
  values (v_name, nullif(trim(p ->> 'phone'), ''), nullif(trim(p ->> 'address'), ''), nullif(trim(p ->> 'city'), ''), v_owner,
    nullif(trim(p ->> 'owner_login'), ''), v_plan, v_renews, nullif(trim(p ->> 'notes'), ''), auth.uid())
  returning id into v_id;
  insert into public.profiles (id, full_name) values (p_owner, v_owner)
  on conflict (id) do update set full_name = excluded.full_name;
  insert into public.business_members (business_id, user_id, role, display_name) values (v_id, p_owner, 'owner', v_owner);
  perform private.seed_business(v_id);
  if v_plan <> 'trial' and coalesce((p ->> 'amount')::numeric, 0) > 0 then
    insert into public.plan_payments (business_id, plan_id, months, amount, method, reference, paid_on, period_from, period_to, note, created_by)
    values (v_id, v_plan, greatest(v_months, 1), (p ->> 'amount')::numeric, coalesce(nullif(p ->> 'method', ''), 'UPI'), nullif(p ->> 'reference', ''),
      (now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date, v_renews, 'First payment', auth.uid());
  end if;
  perform private.audit(v_id, 'BUSINESS_CREATE', 'businesses', v_id, jsonb_build_object('name', v_name, 'plan', v_plan, 'by', 'super_admin'));
  return jsonb_build_object('id', v_id, 'renews_at', v_renews);
end $$;

create or replace function public.admin_update_business(p_business_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare b public.businesses;
begin
  perform private.require_super_admin();
  select * into b from public.businesses where id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: business'; end if;
  if p ? 'plan_id' and not exists (select 1 from public.plans where id = p ->> 'plan_id') then raise exception 'NOT_FOUND: plan'; end if;
  if p ? 'status' and p ->> 'status' not in ('active', 'suspended') then raise exception 'VALIDATION: status'; end if;
  update public.businesses set
    name = coalesce(nullif(trim(p ->> 'name'), ''), name),
    city = case when p ? 'city' then nullif(trim(p ->> 'city'), '') else city end,
    phone = case when p ? 'phone' then nullif(trim(p ->> 'phone'), '') else phone end,
    owner_name = case when p ? 'owner_name' then nullif(trim(p ->> 'owner_name'), '') else owner_name end,
    admin_notes = case when p ? 'notes' then nullif(trim(p ->> 'notes'), '') else admin_notes end,
    plan_id = coalesce(nullif(p ->> 'plan_id', ''), plan_id),
    renews_at = coalesce(nullif(p ->> 'renews_at', '')::date, renews_at),
    grace_until = case when p ? 'grace_until' then nullif(p ->> 'grace_until', '')::date else grace_until end,
    status = coalesce(nullif(p ->> 'status', ''), status),
    updated_at = now()
  where id = p_business_id;
  perform private.audit(p_business_id, 'ADMIN_UPDATE', 'businesses', p_business_id, p);
  return jsonb_build_object('id', p_business_id, 'state', private.plan_state(p_business_id));
end $$;

/** Record a payment and extend the plan from the later of today and the current end date. */
create or replace function public.admin_renew(p_business_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare b public.businesses; v_plan text; v_months integer := coalesce((p ->> 'months')::integer, 1); v_from date; v_to date;
  today date := (now() at time zone 'Asia/Kolkata')::date; v_amt numeric := coalesce(nullif(p ->> 'amount', '')::numeric, 0);
begin
  perform private.require_super_admin();
  select * into b from public.businesses where id = p_business_id for update;
  if not found then raise exception 'NOT_FOUND: business'; end if;
  v_plan := coalesce(nullif(p ->> 'plan_id', ''), b.plan_id);
  if v_plan = 'trial' then raise exception 'VALIDATION: choose a paid plan'; end if;
  if not exists (select 1 from public.plans where id = v_plan) then raise exception 'NOT_FOUND: plan'; end if;
  if v_months not in (1, 3, 6, 12, 24) then raise exception 'VALIDATION: months'; end if;
  if v_amt < 0 then raise exception 'VALIDATION: amount'; end if;
  v_from := greatest(b.renews_at, today);
  v_to := (v_from + make_interval(months => v_months))::date;
  insert into public.plan_payments (business_id, plan_id, months, amount, method, reference, paid_on, period_from, period_to, note, created_by)
  values (b.id, v_plan, v_months, v_amt, coalesce(nullif(p ->> 'method', ''), 'UPI'), nullif(trim(p ->> 'reference'), ''),
    coalesce(nullif(p ->> 'paid_on', '')::date, today), v_from, v_to, nullif(trim(p ->> 'note'), ''), auth.uid());
  update public.businesses set plan_id = v_plan, renews_at = v_to, grace_until = null, status = 'active', updated_at = now() where id = b.id;
  update public.plan_requests set status = 'DONE', handled_at = now() where business_id = b.id and status = 'NEW'
    and (nullif(p ->> 'request_id', '') is null or id = (p ->> 'request_id')::uuid);
  perform private.audit(b.id, 'PLAN_RENEW', 'businesses', b.id, jsonb_build_object('plan', v_plan, 'months', v_months, 'amount', v_amt, 'to', v_to));
  return jsonb_build_object('renews_at', v_to, 'plan_id', v_plan);
end $$;

create or replace function public.admin_set_request(p_request_id uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if p_status not in ('DONE', 'REJECTED', 'NEW') then raise exception 'VALIDATION: status'; end if;
  update public.plan_requests set status = p_status, handled_at = now() where id = p_request_id;
end $$;

create or replace function public.admin_requests()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return (select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('business_name', b.name, 'plan_name', p.name) order by r.created_at desc), '[]'::jsonb)
    from public.plan_requests r join public.businesses b on b.id = r.business_id join public.plans p on p.id = r.plan_id
    where r.status = 'NEW' or r.created_at > now() - interval '30 days');
end $$;

create or replace function public.admin_leads()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return (select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb) from (select * from public.leads order by created_at desc limit 500) l);
end $$;

create or replace function public.admin_update_lead(p_id uuid, p_status text, p_notes text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if p_status not in ('NEW', 'CONTACTED', 'CONVERTED', 'CLOSED') then raise exception 'VALIDATION: status'; end if;
  update public.leads set status = p_status, notes = nullif(trim(p_notes), '') where id = p_id;
end $$;

create or replace function public.admin_plans()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return (select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('businesses', (select count(*) from public.businesses b where b.plan_id = p.id)) order by p.sort_order), '[]'::jsonb) from public.plans p);
end $$;

create or replace function public.admin_upsert_plan(p jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_mods text[];
begin
  perform private.require_super_admin();
  select coalesce(array_agg(x), '{}') into v_mods from jsonb_array_elements_text(coalesce(p -> 'modules', '[]')) x
    where x in ('suppliers', 'orders', 'trips', 'expenses', 'pnl', 'reports');
  if char_length(coalesce(trim(p ->> 'name'), '')) < 2 then raise exception 'VALIDATION: plan name'; end if;
  insert into public.plans (id, name, name_mr, name_hi, blurb, blurb_mr, blurb_hi, monthly, half_yearly, yearly, modules, max_staff, max_drivers, max_vehicles,
    features, highlight, public, sort_order, active, updated_at)
  values (p ->> 'id', trim(p ->> 'name'), nullif(p ->> 'name_mr', ''), nullif(p ->> 'name_hi', ''), nullif(p ->> 'blurb', ''), nullif(p ->> 'blurb_mr', ''), nullif(p ->> 'blurb_hi', ''),
    nullif(p ->> 'monthly', '')::numeric, nullif(p ->> 'half_yearly', '')::numeric, nullif(p ->> 'yearly', '')::numeric, v_mods,
    nullif(p ->> 'max_staff', '')::integer, nullif(p ->> 'max_drivers', '')::integer, nullif(p ->> 'max_vehicles', '')::integer,
    coalesce(p -> 'features', '[]'::jsonb), coalesce((p ->> 'highlight')::boolean, false), coalesce((p ->> 'public')::boolean, true),
    coalesce((p ->> 'sort_order')::integer, 10), coalesce((p ->> 'active')::boolean, true), now())
  on conflict (id) do update set name = excluded.name, name_mr = excluded.name_mr, name_hi = excluded.name_hi, blurb = excluded.blurb,
    blurb_mr = excluded.blurb_mr, blurb_hi = excluded.blurb_hi, monthly = excluded.monthly, half_yearly = excluded.half_yearly, yearly = excluded.yearly,
    modules = case when public.plans.id = 'trial' then public.plans.modules else excluded.modules end,
    max_staff = excluded.max_staff, max_drivers = excluded.max_drivers, max_vehicles = excluded.max_vehicles, features = excluded.features,
    highlight = excluded.highlight, public = case when public.plans.id = 'trial' then false else excluded.public end,
    sort_order = excluded.sort_order, active = excluded.active, updated_at = now();
end $$;

create or replace function public.admin_settings(p jsonb default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare s public.platform_settings;
begin
  perform private.require_super_admin();
  if p is not null then
    update public.platform_settings set
      brand_name = coalesce(nullif(trim(p ->> 'brand_name'), ''), brand_name),
      whatsapp = case when p ? 'whatsapp' then nullif(regexp_replace(p ->> 'whatsapp', '[^0-9]', '', 'g'), '') else whatsapp end,
      upi_id = case when p ? 'upi_id' then nullif(trim(p ->> 'upi_id'), '') else upi_id end,
      payee_name = case when p ? 'payee_name' then nullif(trim(p ->> 'payee_name'), '') else payee_name end,
      support_phone = case when p ? 'support_phone' then nullif(trim(p ->> 'support_phone'), '') else support_phone end,
      support_email = case when p ? 'support_email' then nullif(trim(p ->> 'support_email'), '') else support_email end,
      trial_days = coalesce(nullif(p ->> 'trial_days', '')::integer, trial_days),
      grace_days = coalesce(nullif(p ->> 'grace_days', '')::integer, grace_days),
      remind_days = coalesce(nullif(p ->> 'remind_days', '')::integer, remind_days),
      updated_at = now()
    where id = 1;
  end if;
  select * into s from public.platform_settings where id = 1;
  return to_jsonb(s);
end $$;

/** Super admin's audit of one business (recent actions). */
create or replace function public.admin_activity(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return (select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'action', action, 'actor', actor) order by created_at desc), '[]'::jsonb)
    from (select * from public.audit_logs where business_id = p_business_id order by created_at desc limit 50) a);
end $$;

-- ---------------------------------------------------------------- RLS ----
alter table public.platform_admins enable row level security;
alter table public.plans enable row level security;
alter table public.platform_settings enable row level security;
alter table public.plan_payments enable row level security;
alter table public.plan_requests enable row level security;
alter table public.leads enable row level security;
-- no direct table access for clients; everything above goes through functions
revoke all on public.platform_admins, public.plans, public.platform_settings, public.plan_payments, public.plan_requests, public.leads from anon, authenticated;

grant execute on all functions in schema public to authenticated;
revoke execute on all functions in schema public from anon, public;
revoke execute on function public.create_business(text, text, text, text) from authenticated;
grant execute on function public.public_plans(), public.public_platform(), public.submit_lead(jsonb) to anon, authenticated;
