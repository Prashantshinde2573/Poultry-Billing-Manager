-- PoulGo · 0018 Saved "Ask" conversations (owner's own history).
create table if not exists public.ai_chats (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_chats_owner_idx on public.ai_chats (business_id, user_id, updated_at desc);
alter table public.ai_chats enable row level security;
revoke all on public.ai_chats from anon, authenticated;

create or replace function public.ai_chat_list(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_owner(p_business_id);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'at', c.updated_at, 'n', jsonb_array_length(c.messages)) order by c.updated_at desc), '[]'::jsonb)
          from (select * from public.ai_chats where business_id = p_business_id and user_id = auth.uid() order by updated_at desc limit 50) c);
end $$;

create or replace function public.ai_chat_get(p_business_id uuid, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare c public.ai_chats;
begin
  perform private.require_owner(p_business_id);
  select * into c from public.ai_chats where id = p_id and business_id = p_business_id and user_id = auth.uid();
  if not found then return null; end if;
  return jsonb_build_object('id', c.id, 'title', c.title, 'messages', c.messages, 'at', c.updated_at);
end $$;

/** Create (p_id null) or replace a conversation. Keeps the last 40 messages. */
create or replace function public.ai_chat_save(p_business_id uuid, p_id uuid, p_messages jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_msgs jsonb; v_title text;
begin
  perform private.require_owner(p_business_id);
  if jsonb_typeof(p_messages) <> 'array' then raise exception 'VALIDATION: messages'; end if;
  select coalesce(jsonb_agg(m order by o), '[]'::jsonb) into v_msgs
    from (select m, o from jsonb_array_elements(p_messages) with ordinality x(m, o) order by o desc limit 40) y;
  v_title := left(coalesce((select m ->> 'text' from jsonb_array_elements(v_msgs) m where m ->> 'role' = 'user' limit 1), '…'), 80);
  if p_id is not null then
    update public.ai_chats set messages = v_msgs, updated_at = now()
      where id = p_id and business_id = p_business_id and user_id = auth.uid() returning id into v_id;
  end if;
  if v_id is null then
    insert into public.ai_chats (business_id, user_id, title, messages) values (p_business_id, auth.uid(), v_title, v_msgs) returning id into v_id;
    -- keep at most 50 conversations per person
    delete from public.ai_chats where business_id = p_business_id and user_id = auth.uid()
      and id not in (select id from public.ai_chats where business_id = p_business_id and user_id = auth.uid() order by updated_at desc limit 50);
  end if;
  return v_id;
end $$;

create or replace function public.ai_chat_delete(p_business_id uuid, p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_owner(p_business_id);
  delete from public.ai_chats where business_id = p_business_id and user_id = auth.uid() and (p_id is null or id = p_id);
end $$;

revoke execute on function public.ai_chat_list(uuid), public.ai_chat_get(uuid, uuid), public.ai_chat_save(uuid, uuid, jsonb), public.ai_chat_delete(uuid, uuid) from anon, public;
grant execute on function public.ai_chat_list(uuid), public.ai_chat_get(uuid, uuid), public.ai_chat_save(uuid, uuid, jsonb), public.ai_chat_delete(uuid, uuid) to authenticated, service_role;
