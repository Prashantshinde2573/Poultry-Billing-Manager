-- PoulGo · 0004 RPC: business onboarding, members, settings, masters
-- Convention: every RPC is SECURITY DEFINER with search_path = '' and checks the caller first.

-- Create a business; the caller becomes its owner. Seeds bird sizes and expense categories.
create or replace function public.create_business(p_name text, p_phone text default null, p_address text default null, p_owner_name text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED: sign in required'; end if;
  if p_name is null or char_length(trim(p_name)) < 2 then raise exception 'VALIDATION: business name is required'; end if;
  if exists (select 1 from public.business_members where user_id = v_uid and role = 'owner' and active) then
    raise exception 'CONFLICT: you already own a business';
  end if;

  insert into public.businesses (name, phone, address, created_by)
  values (trim(p_name), nullif(trim(p_phone), ''), nullif(trim(p_address), ''), v_uid)
  returning id into v_id;

  insert into public.profiles (id, full_name) values (v_uid, coalesce(p_owner_name, ''))
  on conflict (id) do update set full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name);

  insert into public.business_members (business_id, user_id, role, display_name)
  values (v_id, v_uid, 'owner', coalesce(nullif(trim(p_owner_name), ''), 'Owner'));

  insert into public.bird_sizes (business_id, name, name_mr, name_hi, sort_order) values
    (v_id, 'Large', 'मोठा', 'बड़ा', 1),
    (v_id, 'Medium', 'मध्यम', 'मध्यम', 2),
    (v_id, 'Small', 'लहान', 'छोटा', 3);

  insert into public.expense_categories (business_id, name, name_mr, name_hi, is_trip_cost) values
    (v_id, 'Diesel / Fuel', 'डिझेल', 'डीज़ल', true),
    (v_id, 'Driver charges', 'ड्रायव्हर खर्च', 'ड्राइवर खर्च', true),
    (v_id, 'Loading / Unloading', 'लोडिंग / अनलोडिंग', 'लोडिंग / अनलोडिंग', true),
    (v_id, 'Toll', 'टोल', 'टोल', true),
    (v_id, 'Vehicle repair', 'गाडी दुरुस्ती', 'गाड़ी मरम्मत', true),
    (v_id, 'Vehicle rent', 'गाडी भाडे', 'गाड़ी किराया', true),
    (v_id, 'Shop rent', 'दुकान भाडे', 'दुकान किराया', false),
    (v_id, 'Salary / Wages', 'पगार', 'वेतन', false),
    (v_id, 'Electricity', 'वीज', 'बिजली', false),
    (v_id, 'Other', 'इतर', 'अन्य', false);

  perform private.audit(v_id, 'BUSINESS_CREATE', 'businesses', v_id, jsonb_build_object('name', p_name));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.update_business(p_business_id uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare b public.businesses; v_settings jsonb;
begin
  perform private.require_owner(p_business_id);
  select * into b from public.businesses where id = p_business_id for update;
  v_settings := b.settings;
  if p_patch ? 'settings' then
    v_settings := v_settings || (
      select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(p_patch -> 'settings') as e(k, v)
      where k in ('allow_customer_advance', 'driver_auto_confirm', 'report_footer', 'statement_note', 'default_sale_rate')
    );
  end if;
  update public.businesses set
    name = coalesce(nullif(trim(p_patch ->> 'name'), ''), name),
    phone = case when p_patch ? 'phone' then nullif(trim(p_patch ->> 'phone'), '') else phone end,
    email = case when p_patch ? 'email' then nullif(trim(p_patch ->> 'email'), '') else email end,
    address = case when p_patch ? 'address' then nullif(trim(p_patch ->> 'address'), '') else address end,
    gstin = case when p_patch ? 'gstin' then nullif(trim(p_patch ->> 'gstin'), '') else gstin end,
    logo_url = case when p_patch ? 'logo_url' then nullif(p_patch ->> 'logo_url', '') else logo_url end,
    settings = v_settings,
    updated_at = now(),
    version = version + 1
  where id = p_business_id;
  perform private.audit(p_business_id, 'BUSINESS_UPDATE', 'businesses', p_business_id, p_patch - 'logo_url');
  return jsonb_build_object('id', p_business_id);
end $$;

create or replace function public.set_my_language(p_language text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED: sign in required'; end if;
  if p_language not in ('mr', 'hi', 'en') then raise exception 'VALIDATION: unknown language'; end if;
  insert into public.profiles (id, preferred_language) values (auth.uid(), p_language)
  on conflict (id) do update set preferred_language = excluded.preferred_language, updated_at = now();
end $$;

-- ---------------------------------------------------------------- members --
-- The login account itself is created server-side (Owner-only server action with the
-- service key). This RPC links that account to the business with a role.
create or replace function public.upsert_member(p_business_id uuid, p_user_id uuid, p_role public.member_role, p_display_name text, p_permissions jsonb default '{}'::jsonb, p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_perms jsonb;
begin
  perform private.require_owner(p_business_id);
  if p_role = 'owner' and p_user_id <> auth.uid() then
    -- allowed: a second owner (e.g. partner)
    null;
  end if;
  if p_user_id = auth.uid() and (p_role <> 'owner' or not p_active) then
    raise exception 'VALIDATION: you cannot remove your own owner access';
  end if;
  v_perms := (
    select coalesce(jsonb_object_agg(k, (v)::text::boolean), '{}'::jsonb)
    from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) as e(k, v)
    where k in ('suppliers', 'expenses', 'verify_payments', 'rate_override', 'reports')
  );
  insert into public.business_members (business_id, user_id, role, permissions, display_name, active)
  values (p_business_id, p_user_id, p_role, case when p_role = 'staff' then v_perms else '{}'::jsonb end, coalesce(trim(p_display_name), ''), p_active)
  on conflict (business_id, user_id) do update set
    role = excluded.role, permissions = excluded.permissions, display_name = excluded.display_name,
    active = excluded.active, updated_at = now()
  returning id into v_id;

  if p_role = 'driver' then
    insert into public.drivers (business_id, user_id, name)
    values (p_business_id, p_user_id, coalesce(nullif(trim(p_display_name), ''), 'Driver'))
    on conflict (business_id, user_id) do update set name = excluded.name, active = p_active;
  end if;

  perform private.audit(p_business_id, 'MEMBER_UPSERT', 'business_members', v_id,
    jsonb_build_object('user_id', p_user_id, 'role', p_role, 'permissions', v_perms, 'active', p_active));
  return jsonb_build_object('id', v_id);
end $$;

-- -------------------------------------------------------------- bird sizes --
create or replace function public.upsert_bird_size(p_business_id uuid, p_id uuid, p_name text, p_name_mr text, p_name_hi text, p_sort_order integer, p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform private.require_owner(p_business_id);
  if p_name is null or char_length(trim(p_name)) < 1 then raise exception 'VALIDATION: size name is required'; end if;
  if p_id is null then
    insert into public.bird_sizes (business_id, name, name_mr, name_hi, sort_order, active)
    values (p_business_id, trim(p_name), nullif(trim(p_name_mr), ''), nullif(trim(p_name_hi), ''), coalesce(p_sort_order, 0), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.bird_sizes set name = trim(p_name), name_mr = nullif(trim(p_name_mr), ''), name_hi = nullif(trim(p_name_hi), ''),
      sort_order = coalesce(p_sort_order, sort_order), active = coalesce(p_active, active)
    where id = p_id and business_id = p_business_id returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND: bird size'; end if;
  end if;
  perform private.audit(p_business_id, 'BIRD_SIZE_UPSERT', 'bird_sizes', v_id, jsonb_build_object('name', p_name));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.set_bird_size_rate(p_business_id uuid, p_bird_size_id uuid, p_kind text, p_rate numeric, p_effective_from date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if p_kind = 'PURCHASE' then perform private.require_perm(p_business_id, 'suppliers');
  else perform private.require_perm(p_business_id, 'rate_override'); end if;
  if p_kind not in ('SALE', 'PURCHASE') then raise exception 'VALIDATION: rate kind'; end if;
  if not exists (select 1 from public.bird_sizes where id = p_bird_size_id and business_id = p_business_id) then
    raise exception 'NOT_FOUND: bird size';
  end if;
  insert into public.bird_size_rates (business_id, bird_size_id, kind, rate, effective_from, created_by)
  values (p_business_id, p_bird_size_id, p_kind, private.money(p_rate, 'rate', true, false), coalesce(p_effective_from, private.business_today(p_business_id)), auth.uid())
  on conflict (bird_size_id, kind, effective_from) do update set rate = excluded.rate, created_by = excluded.created_by, created_at = now()
  returning id into v_id;
  perform private.audit(p_business_id, 'RATE_SET', 'bird_size_rates', v_id,
    jsonb_build_object('bird_size_id', p_bird_size_id, 'kind', p_kind, 'rate', p_rate, 'effective_from', p_effective_from));
  return jsonb_build_object('id', v_id);
end $$;

-- Latest effective rate for a size on a date (null when none set).
create or replace function private.size_rate(p_business_id uuid, p_bird_size_id uuid, p_kind text, p_date date)
returns numeric language sql stable security definer set search_path = ''
as $$
  select r.rate from public.bird_size_rates r
  where r.business_id = p_business_id and r.bird_size_id = p_bird_size_id and r.kind = p_kind and r.effective_from <= p_date
  order by r.effective_from desc limit 1
$$;

-- ---------------------------------------------------------- vehicles/drivers --
create or replace function public.upsert_vehicle(p_business_id uuid, p_id uuid, p_registration_no text, p_ownership text, p_description text, p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform private.require_office(p_business_id);
  if p_registration_no is null or char_length(trim(p_registration_no)) < 2 then raise exception 'VALIDATION: vehicle number is required'; end if;
  if coalesce(p_ownership, 'OWNED') not in ('OWNED', 'RENTED') then raise exception 'VALIDATION: ownership'; end if;
  if p_id is null then
    insert into public.vehicles (business_id, registration_no, ownership, description, active)
    values (p_business_id, upper(trim(p_registration_no)), coalesce(p_ownership, 'OWNED'), nullif(trim(p_description), ''), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.vehicles set registration_no = upper(trim(p_registration_no)), ownership = coalesce(p_ownership, ownership),
      description = nullif(trim(p_description), ''), active = coalesce(p_active, active)
    where id = p_id and business_id = p_business_id returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND: vehicle'; end if;
  end if;
  perform private.audit(p_business_id, 'VEHICLE_UPSERT', 'vehicles', v_id, jsonb_build_object('registration_no', p_registration_no));
  return jsonb_build_object('id', v_id);
end $$;

-- Driver profile (optionally without a login yet — e.g. a rented-vehicle driver).
create or replace function public.upsert_driver(p_business_id uuid, p_id uuid, p_name text, p_phone text, p_license_no text, p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform private.require_office(p_business_id);
  if p_name is null or char_length(trim(p_name)) < 2 then raise exception 'VALIDATION: driver name is required'; end if;
  if p_id is null then
    insert into public.drivers (business_id, name, phone, license_no, active)
    values (p_business_id, trim(p_name), nullif(trim(p_phone), ''), nullif(trim(p_license_no), ''), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.drivers set name = trim(p_name), phone = nullif(trim(p_phone), ''), license_no = nullif(trim(p_license_no), ''),
      active = coalesce(p_active, active)
    where id = p_id and business_id = p_business_id returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND: driver'; end if;
  end if;
  perform private.audit(p_business_id, 'DRIVER_UPSERT', 'drivers', v_id, jsonb_build_object('name', p_name));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.upsert_expense_category(p_business_id uuid, p_id uuid, p_name text, p_name_mr text, p_name_hi text, p_is_trip_cost boolean, p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform private.require_owner(p_business_id);
  if p_name is null or char_length(trim(p_name)) < 2 then raise exception 'VALIDATION: category name is required'; end if;
  if p_id is null then
    insert into public.expense_categories (business_id, name, name_mr, name_hi, is_trip_cost, active)
    values (p_business_id, trim(p_name), nullif(trim(p_name_mr), ''), nullif(trim(p_name_hi), ''), coalesce(p_is_trip_cost, false), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.expense_categories set name = trim(p_name), name_mr = nullif(trim(p_name_mr), ''), name_hi = nullif(trim(p_name_hi), ''),
      is_trip_cost = coalesce(p_is_trip_cost, is_trip_cost), active = coalesce(p_active, active)
    where id = p_id and business_id = p_business_id returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND: category'; end if;
  end if;
  return jsonb_build_object('id', v_id);
end $$;
