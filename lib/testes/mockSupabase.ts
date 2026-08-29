import { vi } from "vitest";

export type RespostaTabela = { data: unknown; error: unknown };

export type ChamadaSupabase = { tabela: string; metodo: string; args: unknown[] };

/**
 * Mock minimo do cliente Supabase que imita o encadeamento fluente real
 * (.from(x).select().eq().single(), .from(x).update().eq(), etc.).
 * Cada tabela tem uma fila de respostas consumida em ordem, uma por
 * chamada terminal (.single() ou await direto do builder).
 */
export function criarSupabaseMock(respostasPorTabela: Record<string, RespostaTabela[]>) {
  const contadores: Record<string, number> = {};
  const chamadas: ChamadaSupabase[] = [];

  function proximaResposta(tabela: string): RespostaTabela {
    const fila = respostasPorTabela[tabela] ?? [];
    const indice = contadores[tabela] ?? 0;
    contadores[tabela] = indice + 1;
    return fila[indice] ?? { data: null, error: null };
  }

  function criarBuilder(tabela: string) {
    const builder: Record<string, unknown> = {};
    const metodosEncadeaveis = ["select", "insert", "update", "eq", "neq", "gte", "in", "or", "order", "limit"];
    for (const metodo of metodosEncadeaveis) {
      builder[metodo] = vi.fn((...args: unknown[]) => {
        chamadas.push({ tabela, metodo, args });
        return builder;
      });
    }
    builder.single = vi.fn(() => Promise.resolve(proximaResposta(tabela)));
    builder.then = (
      resolve: (valor: RespostaTabela) => unknown,
      reject?: (erro: unknown) => unknown
    ) => Promise.resolve(proximaResposta(tabela)).then(resolve, reject);
    return builder;
  }

  const from = vi.fn((tabela: string) => criarBuilder(tabela));

  return { from, chamadas };
}
