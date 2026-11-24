-- PoulGo · 0001 Foundation: businesses, profiles, membership, roles, helpers, audit
-- See docs/ARCHITECTURE.md. All writes happen through SECURITY DEFINER RPCs.

-- gen_random_uuid() is built into PostgreSQL 13+; no extension needed.

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------- types --
do $$ begin
  create type public.member_role as enum ('owner', 'staff', 'driver');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------ businesses --
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  phone text,
  email text,
  address text,
  gstin text,
  timezone text not null default 'Asia/Kolkata',
  logo_url text,
  settings jsonb not null default jsonb_build_object(
    'allow_customer_advance', false,
    'driver_auto_confirm', false,
    'costing_method', 'WEIGHTED_AVERAGE',
    'report_footer', 'Thank you for your business.'
  ),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  preferred_language text not null default 'mr' check (preferred_language in ('mr', 'hi', 'en')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  permissions jsonb not null default '{}'::jsonb,
  display_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);
create index business_members_user_idx on public.business_members (user_id) where active;

-- Per-business running numbers (ORD-0001, TRP-0001, BIL-0001, PUR-0001 …)
create table public.business_counters (
  business_id uuid not null references public.businesses (id) on delete cascade,
  key text not null,
  value bigint not null default 0,
  primary key (business_id, key)
);

-- ----------------------------------------------------------------- audit --
create table public.audit_logs (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses (id) on delete cascade,
  actor uuid,
  action text not null,
  entity text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_business_idx on public.audit_logs (business_id, created_at desc);

-- ------------------------------------------------------- helper functions --
-- Caller's active role in a business (null when not a member).
create or replace function private.member_role(p_business_id uuid)
returns public.member_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.business_members m
  where m.business_id = p_business_id and m.user_id = auth.uid() and m.active
  limit 1
$$;

create or replace function private.is_member(p_business_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.member_role(p_business_id) is not null $$;

create or replace function private.is_owner(p_business_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.member_role(p_business_id) = 'owner', false) $$;

-- Owner → true; staff → explicit permission; driver → false.
create or replace function private.has_perm(p_business_id uuid, p_perm text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case m.role
             when 'owner' then true
             when 'staff' then coalesce((m.permissions ->> p_perm)::boolean, false)
             else false
           end
    from public.business_members m
    where m.business_id = p_business_id and m.user_id = auth.uid() and m.active
    limit 1
  ), false)
$$;

create or replace function private.is_office(p_business_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.member_role(p_business_id) in ('owner', 'staff'), false) $$;

-- Guards used at the top of every RPC. They raise errors whose message starts with a code
-- the app translates: FORBIDDEN, NOT_FOUND, VALIDATION, CONFLICT, DUPLICATE, OVERPAYMENT …
create or replace function private.require_member(p_business_id uuid)
returns public.member_role language plpgsql stable security definer set search_path = ''
as $$
declare r public.member_role;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED: sign in required'; end if;
  r := private.member_role(p_business_id);
  if r is null then raise exception 'FORBIDDEN: not a member of this business'; end if;
  return r;
end $$;

create or replace function private.require_office(p_business_id uuid)
returns public.member_role language plpgsql stable security definer set search_path = ''
as $$
declare r public.member_role;
begin
  r := private.require_member(p_business_id);
  if r = 'driver' then raise exception 'FORBIDDEN: office users only'; end if;
  return r;
end $$;

create or replace function private.require_owner(p_business_id uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.require_member(p_business_id) <> 'owner' then
    raise exception 'FORBIDDEN: owner only';
  end if;
end $$;

create or replace function private.require_perm(p_business_id uuid, p_perm text)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_member(p_business_id);
  if not private.has_perm(p_business_id, p_perm) then
    raise exception 'FORBIDDEN: permission "%" required', p_perm;
  end if;
end $$;

create or replace function private.next_number(p_business_id uuid, p_key text, p_prefix text)
returns text language plpgsql security definer set search_path = ''
as $$
declare v bigint;
begin
  insert into public.business_counters as c (business_id, key, value)
  values (p_business_id, p_key, 1)
  on conflict (business_id, key) do update set value = c.value + 1
  returning value into v;
  return p_prefix || '-' || lpad(v::text, 4, '0');
end $$;

create or replace function private.audit(p_business_id uuid, p_action text, p_entity text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = ''
as $$
  insert into public.audit_logs (business_id, actor, action, entity, entity_id, metadata)
  values (p_business_id, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
$$;

-- Today in the business's own timezone.
create or replace function private.business_today(p_business_id uuid)
returns date language sql stable security definer set search_path = ''
as $$ select (now() at time zone coalesce((select b.timezone from public.businesses b where b.id = p_business_id), 'Asia/Kolkata'))::date $$;

-- Money helpers: validate and round half-up to paisa / gram.
create or replace function private.money(p_value numeric, p_field text, p_allow_zero boolean default false, p_allow_negative boolean default false)
returns numeric language plpgsql immutable set search_path = ''
as $$
begin
  if p_value is null then raise exception 'VALIDATION: % is required', p_field; end if;
  if p_value <> round(p_value, 2) then raise exception 'VALIDATION: % can have at most 2 decimals', p_field; end if;
  if not p_allow_negative and p_value < 0 then raise exception 'VALIDATION: % cannot be negative', p_field; end if;
  if not p_allow_zero and p_value = 0 then raise exception 'VALIDATION: % must be greater than zero', p_field; end if;
  if abs(p_value) > 1000000000 then raise exception 'VALIDATION: % is too large', p_field; end if;
  return p_value;
end $$;

create or replace function private.weight(p_value numeric, p_field text, p_allow_zero boolean default false)
returns numeric language plpgsql immutable set search_path = ''
as $$
begin
  if p_value is null then raise exception 'VALIDATION: % is required', p_field; end if;
  if p_value <> round(p_value, 3) then raise exception 'VALIDATION: % can have at most 3 decimals', p_field; end if;
  if p_value < 0 or (not p_allow_zero and p_value = 0) then raise exception 'VALIDATION: % must be greater than zero', p_field; end if;
  if p_value > 1000000 then raise exception 'VALIDATION: % is too large', p_field; end if;
  return p_value;
end $$;

create or replace function private.qty(p_value integer, p_field text, p_allow_zero boolean default true)
returns integer language plpgsql immutable set search_path = ''
as $$
begin
  if p_value is null then raise exception 'VALIDATION: % is required', p_field; end if;
  if p_value < 0 or (not p_allow_zero and p_value = 0) then raise exception 'VALIDATION: % must be a whole number above zero', p_field; end if;
  if p_value > 1000000 then raise exception 'VALIDATION: % is too large', p_field; end if;
  return p_value;
end $$;

-- Immutable history: block UPDATE/DELETE on financial and audit tables.
create or replace function private.forbid_change()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'IMMUTABLE: % rows cannot be changed or deleted; post a reversal instead', tg_table_name;
end $$;

create trigger audit_logs_immutable before update or delete on public.audit_logs
for each row execute function private.forbid_change();

-- New auth user → profile row.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone, preferred_language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone',
    coalesce(nullif(new.raw_user_meta_data ->> 'preferred_language', ''), 'mr')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();
