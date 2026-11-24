-- PoulGo · 0017 "Ask" (AI chat on the business's own data): plan module + monthly question limit.

update public.plans set modules = array_append(modules, 'ai') where id in ('pro', 'trial') and not ('ai' = any (modules));
alter table public.platform_settings add column if not exists ai_monthly_limit integer not null default 300 check (ai_monthly_limit between 0 and 100000);

create table if not exists public.ai_usage (
  business_id uuid not null references public.businesses (id) on delete cascade,
  month date not null,
  questions integer not null default 0,
  primary key (business_id, month)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

/** Owner asks one question: checks the plan and this month's limit, then counts it. */
create or replace function public.ai_take_question(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_month date := date_trunc('month', private.business_today(p_business_id))::date; v_limit integer; v_used integer;
begin
  perform private.require_owner(p_business_id);
  perform private.require_module(p_business_id, 'ai');
  select ai_monthly_limit into v_limit from public.platform_settings where id = 1;
  insert into public.ai_usage (business_id, month, questions) values (p_business_id, v_month, 0) on conflict do nothing;
  select questions into v_used from public.ai_usage where business_id = p_business_id and month = v_month for update;
  if v_used >= coalesce(v_limit, 300) then raise exception 'PLAN_LIMIT: this month''s questions are used up'; end if;
  update public.ai_usage set questions = questions + 1 where business_id = p_business_id and month = v_month;
  return jsonb_build_object('used', v_used + 1, 'limit', v_limit);
end $$;

/** How many questions are left this month (owner). */
create or replace function public.ai_quota(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_month date := date_trunc('month', private.business_today(p_business_id))::date;
begin
  perform private.require_owner(p_business_id);
  return jsonb_build_object('used', coalesce((select questions from public.ai_usage where business_id = p_business_id and month = v_month), 0),
    'limit', (select ai_monthly_limit from public.platform_settings where id = 1));
end $$;

revoke execute on function public.ai_take_question(uuid), public.ai_quota(uuid) from anon, public;
grant execute on function public.ai_take_question(uuid), public.ai_quota(uuid) to authenticated, service_role;

-- super admin can change the monthly AI question limit
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
      ai_monthly_limit = coalesce(nullif(p ->> 'ai_monthly_limit', '')::integer, ai_monthly_limit),
      updated_at = now()
    where id = 1;
  end if;
  select * into s from public.platform_settings where id = 1;
  return to_jsonb(s);
end $$;
