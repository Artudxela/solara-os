create table if not exists public.extratos_importados (
  id uuid primary key default gen_random_uuid(),
  nome_arquivo text not null,
  importado_em timestamptz not null default now(),
  importado_por uuid,
  total_linhas int not null default 0,
  total_creditos int not null default 0
);

alter table public.extratos_importados enable row level security;

create policy "extratos_importados_select_autenticado"
  on public.extratos_importados for select
  to authenticated
  using (true);

create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  extrato_id uuid not null references public.extratos_importados(id) on delete cascade,
  data text not null,
  descricao text not null,
  valor numeric not null,
  tipo text not null check (tipo in ('credito', 'debito')),
  cod_titulo_casado text,
  situacao text not null check (situacao in ('casado', 'divergente', 'ignorado'))
);

create index if not exists lancamentos_extrato_id_idx on public.lancamentos (extrato_id);

alter table public.lancamentos enable row level security;

create policy "lancamentos_select_autenticado"
  on public.lancamentos for select
  to authenticated
  using (true);

create table if not exists public.divergencias (
  id uuid primary key default gen_random_uuid(),
  extrato_id uuid not null references public.extratos_importados(id) on delete cascade,
  tipo_inicial text not null check (
    tipo_inicial in ('valor_diferente_mesma_nf', 'sem_titulo_correspondente', 'possivel_soma', 'duplicado', 'vencido_sem_pagamento')
  ),
  lancamento_id uuid references public.lancamentos(id),
  cod_titulo text,
  valor_lancamento numeric,
  valor_titulo numeric,
  status text not null default 'nova' check (status in ('nova', 'investigando', 'aguardando_aprovacao', 'resolvida')),
  hipotese jsonb
);

create index if not exists divergencias_extrato_id_idx on public.divergencias (extrato_id);

alter table public.divergencias enable row level security;

create policy "divergencias_select_autenticado"
  on public.divergencias for select
  to authenticated
  using (true);

alter publication supabase_realtime add table public.divergencias;
