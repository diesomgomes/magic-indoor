-- Magic Indoor — schema multi-tenant para Supabase (Postgres + Auth + RLS).
--
-- Como usar:
--   1. Crie um projeto em https://supabase.com.
--   2. Abra o SQL Editor do projeto e rode este arquivo inteiro.
--   3. Copie a "Project URL" e a "anon public key" (Project Settings → API)
--      para Configurações → Integração Supabase no painel.
--
-- Cada tabela tem uma coluna owner_id apontando para o usuario dono (auth.users).
-- As policies de RLS abaixo garantem que uma conta só enxerga e mexe nos próprios
-- dados — é isso que torna as contas individuais (cada empresa só vê o que é seu).

create extension if not exists "pgcrypto";

create table if not exists public.company_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  razao_social text,
  cnpj text,
  endereco text,
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  name text,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'rejeitado')),
  last_seen_at timestamptz,
  is_online boolean not null default false,
  screen_width integer,
  screen_height integer,
  screen_density text,
  created_at timestamptz not null default now(),
  unique (owner_id, code)
);

create table if not exists public.media_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null,
  media_kind text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  orientation text not null default 'horizontal' check (orientation in ('horizontal', 'vertical')),
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  media_id uuid references public.media_files(id) on delete cascade,
  file_name text not null default '',
  file_type text not null default '',
  file_size bigint not null default 0,
  media_kind text not null,
  duration_seconds integer not null default 8,
  fit_mode text not null default 'original' check (fit_mode in ('original', 'adaptavel')),
  rotation integer not null default 0 check (rotation in (0, 90, 180, 270)),
  position integer not null default 0,
  source_url text,
  integration text,
  news_count integer,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_devices (
  owner_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (campaign_id, device_id)
);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- RLS: cada conta só ve/edita as proprias linhas.
alter table public.company_settings enable row level security;
alter table public.devices enable row level security;
alter table public.media_files enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_items enable row level security;
alter table public.campaign_devices enable row level security;
alter table public.events enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'company_settings', 'devices', 'media_files', 'campaigns',
    'campaign_items', 'campaign_devices', 'events'
  ])
  loop
    execute format(
      'create policy "owner_all_%1$s" on public.%1$s for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());',
      t
    );
  end loop;
end $$;

-- Bucket de storage para os arquivos de midia (imagens/videos/GIFs), publico para leitura
-- (o player Android busca via URL simples) mas so a propria conta pode enviar/apagar.
insert into storage.buckets (id, name, public)
  values ('media', 'media', true)
  on conflict (id) do nothing;

create policy "media_public_read" on storage.objects for select
  using (bucket_id = 'media');

create policy "media_owner_write" on storage.objects for insert
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "media_owner_delete" on storage.objects for delete
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
