create table if not exists public.aprovacoes (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('vendas', 'financeiro')),
  item_tipo text not null check (item_tipo in ('pedido', 'divergencia')),
  item_id text not null,
  titulo text not null,
  proposta jsonb,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'editada', 'rejeitada')),
  decidido_por uuid,
  decidido_em timestamptz,
  observacao text
);

create index if not exists aprovacoes_item_id_idx on public.aprovacoes (item_id);

alter table public.aprovacoes enable row level security;

create policy "aprovacoes_select_autenticado"
  on public.aprovacoes for select
  to authenticated
  using (true);
