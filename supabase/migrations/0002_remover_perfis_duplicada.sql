-- A tabela "perfis" (0001) duplicava a "TB_PERFIS" ja existente (criada fora
-- deste repositorio, com dados reais e provavelmente um trigger de auto-provisao).
-- O app passa a usar TB_PERFIS; esta tabela extra e removida.
drop table if exists public.perfis;
