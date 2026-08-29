import { criarClienteAdmin } from "@/lib/supabase/admin";
import { agente } from "@/lib/agente";
import { identificarClientePorDescricao, diasEntre, type ClienteBasico } from "@/lib/financeiro/casar";

type Divergencia = {
  id: string;
  tipo_inicial: string;
  lancamento_id: string | null;
  cod_titulo: string | null;
  valor_lancamento: number | null;
  valor_titulo: number | null;
  status: string;
};

type Lancamento = { id: string; data: string; descricao: string; valor: number; situacao: string };

type TituloAberto = {
  cod_titulo: string;
  cod_cliente: string;
  nota_fiscal: string;
  valor: number;
  emissao: string;
  vencimento: string;
  status: string;
};

type SaidaInvestigador = {
  hipotese: string;
  explicacao: string;
  confianca: number;
  acao_sugerida: string;
  cod_titulos_envolvidos: string[];
  valor_a_baixar: number;
  valor_pendente: number;
};

type SaidaConsolidador = { relatorio_markdown: string; acoes: string[] };
type SaidaRevisor = { aprovado: boolean; motivos: string[] };

function calcularResumo(lancamentosExtrato: Lancamento[], divergencias: Divergencia[]) {
  const casados = lancamentosExtrato.filter((l) => l.situacao === "casado");
  const qtd_casados = casados.length;
  const valor_casado = casados.reduce((s, l) => s + l.valor, 0);
  const qtd_divergencias = divergencias.length;
  const valor_divergente = divergencias.reduce((s, d) => s + (d.valor_lancamento ?? d.valor_titulo ?? 0), 0);
  const datas = lancamentosExtrato.map((l) => l.data).sort();
  const periodo = datas.length > 0 ? `${datas[0]} a ${datas[datas.length - 1]}` : "";
  return { qtd_casados, valor_casado, qtd_divergencias, valor_divergente, periodo };
}

export async function conciliar(extrato_id: string) {
  const supabase = criarClienteAdmin();

  const { data: divergenciasNovas, error: erroDivergencias } = await supabase
    .from("divergencias")
    .select("*")
    .eq("extrato_id", extrato_id)
    .eq("status", "nova");

  if (erroDivergencias) {
    throw new Error(`Falha ao buscar divergencias: ${erroDivergencias.message}`);
  }
  const divergencias = (divergenciasNovas ?? []) as Divergencia[];

  const [{ data: lancamentosExtratoRaw }, { data: titulosAbertosRaw }, { data: clientesRaw }] = await Promise.all([
    supabase.from("lancamentos").select("id, data, descricao, valor, situacao").eq("extrato_id", extrato_id),
    supabase
      .from("TB_TITULOS")
      .select("cod_titulo, cod_cliente, nota_fiscal, valor, emissao, vencimento, status")
      .eq("status", "aberto"),
    supabase.from("TB_CLIENTES").select("cod_cliente, nome"),
  ]);

  const lancamentosExtrato = (lancamentosExtratoRaw ?? []) as Lancamento[];
  const lancamentosPorId = new Map(lancamentosExtrato.map((l) => [l.id, l]));
  const titulosAbertos = (titulosAbertosRaw ?? []) as TituloAberto[];
  const clientes = (clientesRaw ?? []) as ClienteBasico[];
  const nomePorCodCliente = new Map(clientes.map((c) => [c.cod_cliente, c.nome]));
  const clientePorCodTitulo = new Map(titulosAbertos.map((t) => [t.cod_titulo, t.cod_cliente]));

  if (divergencias.length > 0) {
    await supabase
      .from("divergencias")
      .update({ status: "investigando" })
      .in("id", divergencias.map((d) => d.id));
  }

  const { data: raiz, error: erroRaiz } = await supabase
    .from("execucoes_agentes")
    .insert({
      area: "financeiro",
      item_tipo: "divergencia",
      item_id: extrato_id,
      agente: "orquestrador",
      status: "rodando",
      inicio: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (erroRaiz || !raiz) {
    throw new Error(`Falha ao criar execucao raiz do orquestrador: ${erroRaiz?.message}`);
  }

  const raizId = raiz.id as string;
  const contextoExecucao = {
    area: "financeiro" as const,
    item_tipo: "divergencia" as const,
    item_id: extrato_id,
    chamado_por: raizId,
  };

  const marcarRaizErro = async (mensagem: string) => {
    await supabase
      .from("execucoes_agentes")
      .update({ status: "erro", erro: mensagem, fim: new Date().toISOString() })
      .eq("id", raizId);
  };

  const fecharRaiz = async () => {
    await supabase
      .from("execucoes_agentes")
      .update({ status: "ok", fim: new Date().toISOString() })
      .eq("id", raizId);
  };

  let hipoteses: (SaidaInvestigador & { divergencia_id: string })[];
  try {
    hipoteses = await Promise.all(
      divergencias.map(async (d) => {
        const lancamento = d.lancamento_id ? lancamentosPorId.get(d.lancamento_id) ?? null : null;
        const codClienteProvavel = lancamento
          ? identificarClientePorDescricao(lancamento.descricao, clientes)
          : d.cod_titulo
            ? clientePorCodTitulo.get(d.cod_titulo.split(",")[0]) ?? null
            : null;
        const valorAlvo = d.valor_lancamento ?? d.valor_titulo ?? 0;
        const dataReferencia = lancamento?.data ?? new Date().toISOString().slice(0, 10);

        const candidatos = titulosAbertos
          .filter((t) => {
            const mesmoCliente = codClienteProvavel !== null && t.cod_cliente === codClienteProvavel;
            const valorProximo = valorAlvo > 0 && Math.abs(t.valor - valorAlvo) / valorAlvo <= 0.1;
            return mesmoCliente || valorProximo;
          })
          .filter((t) => diasEntre(t.vencimento, dataReferencia) <= 30)
          .map((t) => ({ ...t, nome_cliente: nomePorCodCliente.get(t.cod_cliente) ?? t.cod_cliente }));

        const resultado = await agente(
          "investigador",
          {
            divergencia: {
              tipo_inicial: d.tipo_inicial,
              valor_lancamento: d.valor_lancamento,
              valor_titulo: d.valor_titulo,
            },
            lancamento: lancamento
              ? { data: lancamento.data, descricao: lancamento.descricao, valor: lancamento.valor }
              : null,
            titulos_candidatos: candidatos,
          },
          contextoExecucao
        );

        return { ...(resultado.saida as SaidaInvestigador), divergencia_id: d.id };
      })
    );
  } catch (erro) {
    await marcarRaizErro((erro as Error).message);
    throw erro;
  }

  const hipotesesSemId: SaidaInvestigador[] = hipoteses.map((h) => ({
    hipotese: h.hipotese,
    explicacao: h.explicacao,
    confianca: h.confianca,
    acao_sugerida: h.acao_sugerida,
    cod_titulos_envolvidos: h.cod_titulos_envolvidos,
    valor_a_baixar: h.valor_a_baixar,
    valor_pendente: h.valor_pendente,
  }));
  const resumo = calcularResumo(lancamentosExtrato, divergencias);
  const titulosParaRevisor = titulosAbertos.map((t) => ({
    cod_titulo: t.cod_titulo,
    valor: t.valor,
    cod_cliente: t.cod_cliente,
    vencimento: t.vencimento,
  }));

  let consolidadorSaida: SaidaConsolidador;
  let revisorSaida: SaidaRevisor;
  try {
    consolidadorSaida = (
      await agente("consolidador", { resumo_casamento: resumo, hipoteses: hipotesesSemId }, contextoExecucao)
    ).saida as SaidaConsolidador;
    revisorSaida = (
      await agente(
        "revisor",
        { hipoteses: hipotesesSemId, titulos_abertos: titulosParaRevisor, relatorio: consolidadorSaida },
        contextoExecucao
      )
    ).saida as SaidaRevisor;

    if (!revisorSaida.aprovado) {
      consolidadorSaida = (
        await agente(
          "consolidador",
          { resumo_casamento: resumo, hipoteses: hipotesesSemId, ajustes: revisorSaida.motivos },
          contextoExecucao
        )
      ).saida as SaidaConsolidador;
      revisorSaida = (
        await agente(
          "revisor",
          { hipoteses: hipotesesSemId, titulos_abertos: titulosParaRevisor, relatorio: consolidadorSaida },
          contextoExecucao
        )
      ).saida as SaidaRevisor;
    }
  } catch (erro) {
    await marcarRaizErro((erro as Error).message);
    throw erro;
  }

  for (const { divergencia_id, ...hipotese } of hipoteses) {
    const divergenciaOriginal = divergencias.find((d) => d.id === divergencia_id);
    const lancamento = divergenciaOriginal?.lancamento_id ? lancamentosPorId.get(divergenciaOriginal.lancamento_id) : null;
    const codCliente = lancamento
      ? identificarClientePorDescricao(lancamento.descricao, clientes)
      : divergenciaOriginal?.cod_titulo
        ? clientePorCodTitulo.get(divergenciaOriginal.cod_titulo.split(",")[0]) ?? null
        : null;
    const rotulo = codCliente
      ? nomePorCodCliente.get(codCliente) ?? codCliente
      : lancamento?.descricao ?? divergenciaOriginal?.cod_titulo ?? "divergência";
    const valorTotal = hipotese.valor_a_baixar + hipotese.valor_pendente;

    await supabase.from("aprovacoes").insert({
      area: "financeiro",
      item_tipo: "divergencia",
      item_id: divergencia_id,
      titulo: `${hipotese.hipotese} · ${rotulo} · R$ ${valorTotal.toFixed(2)}`,
      proposta: hipotese,
      status: "pendente",
    });

    await supabase.from("divergencias").update({ status: "aguardando_aprovacao", hipotese }).eq("id", divergencia_id);
  }

  await fecharRaiz();

  return { hipoteses: hipotesesSemId, relatorio: consolidadorSaida, revisao: revisorSaida };
}
