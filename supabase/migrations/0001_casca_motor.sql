-- Casca: tabela de perfis
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text,
  papel text not null default 'operador' check (papel in ('admin', 'operador')),
  areas text[] not null default '{}',
  criado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;

create policy "perfis_select_proprio"
  on public.perfis for select
  to authenticated
  using (id = auth.uid());

-- Motor: tabela de execucoes_agentes
create table if not exists public.execucoes_agentes (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('vendas', 'financeiro')),
  item_tipo text not null check (item_tipo in ('pedido', 'divergencia')),
  item_id text not null,
  agente text not null check (
    agente in ('orquestrador', 'triador', 'pesquisador', 'redator', 'revisor', 'investigador', 'consolidador')
  ),
  chamado_por uuid references public.execucoes_agentes(id) on delete set null,
  status text not null default 'rodando' check (status in ('rodando', 'ok', 'erro')),
  entrada jsonb,
  saida jsonb,
  erro text,
  tokens_entrada int,
  tokens_saida int,
  inicio timestamptz,
  fim timestamptz
);

create index if not exists execucoes_agentes_item_id_idx on public.execucoes_agentes (item_id);

alter table public.execucoes_agentes enable row level security;

create policy "execucoes_agentes_select_autenticado"
  on public.execucoes_agentes for select
  to authenticated
  using (true);

-- Habilita Realtime para o organograma acompanhar as execucoes ao vivo
alter publication supabase_realtime add table public.execucoes_agentes;
