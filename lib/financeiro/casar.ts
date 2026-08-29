import type { LinhaLancamento } from "@/lib/financeiro/limpar";

export type TituloParaCasamento = {
  cod_titulo: string;
  cod_cliente: string;
  nota_fiscal: string;
  valor: number;
  emissao: string;
  vencimento: string;
  status: string;
};

export type ClienteBasico = { cod_cliente: string; nome: string };

export type TipoInicial =
  | "valor_diferente_mesma_nf"
  | "sem_titulo_correspondente"
  | "possivel_soma"
  | "duplicado"
  | "vencido_sem_pagamento";

export type Divergente = {
  lancamento: LinhaLancamento;
  tipo_inicial: TipoInicial;
  titulo_relacionado?: TituloParaCasamento;
  titulos_relacionados?: TituloParaCasamento[];
};

export type Casado = { lancamento: LinhaLancamento; cod_titulo: string };

export type ResultadoCasamento = {
  casados: Casado[];
  divergentes: Divergente[];
  ignorados: LinhaLancamento[];
  vencidosSemPagamento: TituloParaCasamento[];
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function identificarClientePorDescricao(
  descricao: string,
  clientes: ClienteBasico[]
): string | null {
  const descricaoNormalizada = normalizar(descricao);
  const encontrado = clientes.find((c) => descricaoNormalizada.includes(normalizar(c.nome)));
  return encontrado?.cod_cliente ?? null;
}

export function diasEntre(dataA: string, dataB: string): number {
  const diferencaMs = new Date(dataA).getTime() - new Date(dataB).getTime();
  return Math.abs(Math.round(diferencaMs / (1000 * 60 * 60 * 24)));
}

function encontrarParSoma(
  titulos: TituloParaCasamento[],
  valorAlvo: number,
  codCliente: string | null
): TituloParaCasamento[] | null {
  const candidatos = codCliente ? titulos.filter((t) => t.cod_cliente === codCliente) : titulos;
  for (let i = 0; i < candidatos.length; i += 1) {
    for (let j = i + 1; j < candidatos.length; j += 1) {
      if (Math.abs(candidatos[i].valor + candidatos[j].valor - valorAlvo) < 0.01) {
        return [candidatos[i], candidatos[j]];
      }
    }
  }
  return null;
}

export function casarLancamentos(
  lancamentos: LinhaLancamento[],
  titulos: TituloParaCasamento[],
  clientes: ClienteBasico[],
  dataFinalExtrato: string
): ResultadoCasamento {
  const titulosAbertos = titulos.filter((t) => t.status === "aberto");
  const titulosUsados = new Set<string>();

  const casados: Casado[] = [];
  const divergentes: Divergente[] = [];
  const ignorados: LinhaLancamento[] = [];

  for (const lancamento of lancamentos) {
    if (lancamento.tipo === "debito") {
      ignorados.push(lancamento);
      continue;
    }

    const codClienteProvavel = identificarClientePorDescricao(lancamento.descricao, clientes);
    const matchNF = lancamento.descricao.match(/NF-?(\d+)/i);
    const notaFiscal = matchNF ? `NF-${matchNF[1]}` : null;

    if (notaFiscal) {
      const tituloMesmaNF = titulosAbertos.find((t) => t.nota_fiscal === notaFiscal);
      if (tituloMesmaNF) {
        const mesmoValor = Math.abs(tituloMesmaNF.valor - lancamento.valor) < 0.01;
        if (mesmoValor && titulosUsados.has(tituloMesmaNF.cod_titulo)) {
          divergentes.push({ lancamento, tipo_inicial: "duplicado", titulo_relacionado: tituloMesmaNF });
          continue;
        }
        if (mesmoValor) {
          titulosUsados.add(tituloMesmaNF.cod_titulo);
          casados.push({ lancamento, cod_titulo: tituloMesmaNF.cod_titulo });
          continue;
        }
        divergentes.push({ lancamento, tipo_inicial: "valor_diferente_mesma_nf", titulo_relacionado: tituloMesmaNF });
        continue;
      }
    }

    const candidatosMesmoValor = titulosAbertos.filter(
      (t) =>
        Math.abs(t.valor - lancamento.valor) < 0.01 &&
        !titulosUsados.has(t.cod_titulo) &&
        diasEntre(t.vencimento, lancamento.data) <= 5
    );
    if (candidatosMesmoValor.length === 1) {
      titulosUsados.add(candidatosMesmoValor[0].cod_titulo);
      casados.push({ lancamento, cod_titulo: candidatosMesmoValor[0].cod_titulo });
      continue;
    }

    const algumComMesmoValor = titulosAbertos.some((t) => Math.abs(t.valor - lancamento.valor) < 0.01);
    if (!algumComMesmoValor) {
      const par = encontrarParSoma(titulosAbertos, lancamento.valor, codClienteProvavel);
      if (par) {
        divergentes.push({ lancamento, tipo_inicial: "possivel_soma", titulos_relacionados: par });
        continue;
      }
    }
    divergentes.push({ lancamento, tipo_inicial: "sem_titulo_correspondente" });
  }

  const vencidosSemPagamento = titulosAbertos.filter(
    (t) => !titulosUsados.has(t.cod_titulo) && t.vencimento < dataFinalExtrato
  );

  return { casados, divergentes, ignorados, vencidosSemPagamento };
}
