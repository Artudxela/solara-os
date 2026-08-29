import { readFile } from "node:fs/promises";
import path from "node:path";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { agente } from "@/lib/agente";

type SaidaTriador = {
  tipo: "orcamento" | "complemento" | "reclamacao" | "fora_do_ramo" | "spam" | "outro";
  itens: { descricao_cliente: string; quantidade: number | null; unidade: string }[];
  prazo_desejado: string | null;
  pede_desconto: boolean;
  desconto_pedido_pct: number | null;
  urgencia: "normal" | "alta" | "critica";
  observacoes: string;
};

type CandidatoCatalogo = {
  cod_produto: string;
  descricao: string;
  unidade: string;
  preco_unitario: number;
  preco_acima_100_un: number;
  estoque: number;
  prazo_reposicao_dias: number;
};

type CandidatosPorItem = {
  descricao_cliente: string;
  quantidade: number | null;
  unidade: string;
  candidatos: CandidatoCatalogo[];
};

type SaidaPesquisador = {
  itens: {
    descricao_cliente: string;
    cod_produto: string | null;
    descricao: string | null;
    quantidade: number | null;
    unidade: string;
    existe: boolean;
    preco_aplicado: number | null;
    estoque: number | null;
    atende_estoque: boolean | null;
    prazo_reposicao_dias: number | null;
  }[];
  condicao_pagamento_dias: number | null;
  desconto_maximo_pct: number | null;
  observacoes: string;
};

type SaidaRedator = { resposta: string; resumo: string };

type SaidaRevisor = { aprovado: boolean; motivos: string[] };

type EntradaRedator = {
  triagem: SaidaTriador;
  contexto: SaidaPesquisador;
  cliente: unknown;
  ajustes?: string[];
};

const PALAVRAS_IGNORADAS = new Set([
  "de", "da", "do", "das", "dos", "e", "um", "uma", "uns", "umas",
  "com", "para", "pra", "por", "ao", "aos", "que", "tem", "favor",
  "cotar", "cotacao", "solicitamos", "proposta", "manda", "mandar",
  "quanto", "fica", "fechar", "pode", "vcs", "vendem",
]);

function extrairPalavrasPrincipais(descricao: string): string[] {
  const normalizado = descricao
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const palavras = normalizado.match(/[a-z0-9/]+/g) ?? [];
  return Array.from(new Set(palavras)).filter(
    (p) => p.length >= 3 && !PALAVRAS_IGNORADAS.has(p)
  );
}

async function buscarCandidatosCatalogo(
  supabase: ReturnType<typeof criarClienteAdmin>,
  itens: SaidaTriador["itens"]
): Promise<CandidatosPorItem[]> {
  return Promise.all(
    itens.map(async (item) => {
      const palavras = extrairPalavrasPrincipais(item.descricao_cliente);
      if (palavras.length === 0) {
        return { ...item, candidatos: [] };
      }
      const condicoes = palavras.map((p) => `descricao.ilike.%${p}%`).join(",");
      const { data } = await supabase
        .from("TB_PRODUTO")
        .select("cod_produto, descricao, unidade, preco_unitario, preco_acima_100_un, estoque, prazo_reposicao_dias")
        .or(condicoes)
        .limit(10);
      return { ...item, candidatos: (data as CandidatoCatalogo[]) ?? [] };
    })
  );
}

async function buscarPedidosAnteriores(
  supabase: ReturnType<typeof criarClienteAdmin>,
  cod_cliente: string,
  cod_pedido_atual: string
) {
  const cortes = new Date();
  cortes.setDate(cortes.getDate() - 30);
  const corteISO = cortes.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("TB_PEDIDOS")
    .select("cod_pedido, data, canal, mensagem, status")
    .eq("cod_cliente", cod_cliente)
    .neq("cod_pedido", cod_pedido_atual)
    .gte("data", corteISO);

  return data ?? [];
}

export async function processarPedido(cod_pedido: string) {
  const supabase = criarClienteAdmin();

  const { data: pedido, error: erroPedido } = await supabase
    .from("TB_PEDIDOS")
    .select("*")
    .eq("cod_pedido", cod_pedido)
    .single();

  if (erroPedido || !pedido) {
    throw new Error(`Pedido ${cod_pedido} nao encontrado`);
  }

  const { data: cliente } = await supabase
    .from("TB_CLIENTES")
    .select("*")
    .eq("cod_cliente", pedido.cod_cliente)
    .single();

  const clienteParaAgentes =
    cliente ?? { cod_cliente: pedido.cod_cliente, nome: pedido.cod_cliente, segmento: null };

  await supabase.from("TB_PEDIDOS").update({ status: "processando" }).eq("cod_pedido", cod_pedido);

  const { data: raiz, error: erroRaiz } = await supabase
    .from("execucoes_agentes")
    .insert({
      area: "vendas",
      item_tipo: "pedido",
      item_id: cod_pedido,
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
  const contextoExecucao = { area: "vendas" as const, item_tipo: "pedido" as const, item_id: cod_pedido, chamado_por: raizId };

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

  let triagem: SaidaTriador;
  try {
    const resultado = await agente(
      "triador",
      {
        mensagem: pedido.mensagem,
        canal: pedido.canal,
        cliente: clienteParaAgentes,
      },
      contextoExecucao
    );
    triagem = resultado.saida as SaidaTriador;
  } catch (erro) {
    await marcarRaizErro((erro as Error).message);
    throw erro;
  }

  if (triagem.tipo !== "orcamento" && triagem.tipo !== "complemento") {
    await supabase.from("aprovacoes").insert({
      area: "vendas",
      item_tipo: "pedido",
      item_id: cod_pedido,
      titulo: `Não é orçamento: ${triagem.tipo}`,
      proposta: triagem,
      status: "pendente",
    });
    await supabase.from("TB_PEDIDOS").update({ status: "aguardando_aprovacao" }).eq("cod_pedido", cod_pedido);
    await fecharRaiz();
    return { triagem };
  }

  let contexto: SaidaPesquisador;
  try {
    const [candidatosPorItem, pedidosAnteriores] = await Promise.all([
      buscarCandidatosCatalogo(supabase, triagem.itens),
      buscarPedidosAnteriores(supabase, pedido.cod_cliente, cod_pedido),
    ]);

    const resultado = await agente(
      "pesquisador",
      {
        itens_pedidos: triagem.itens,
        candidatos_catalogo: candidatosPorItem,
        cliente: clienteParaAgentes,
        pedidos_anteriores: pedidosAnteriores,
      },
      contextoExecucao
    );
    contexto = resultado.saida as SaidaPesquisador;
  } catch (erro) {
    await marcarRaizErro((erro as Error).message);
    throw erro;
  }

  const textoRegrasRevisor = await readFile(
    path.join(process.cwd(), "prompts", "vendas", "revisor.md"),
    "utf-8"
  );

  let entradaRedator: EntradaRedator = { triagem, contexto, cliente: clienteParaAgentes };
  let redatorSaida: SaidaRedator;
  let revisorSaida: SaidaRevisor;

  try {
    redatorSaida = (await agente("redator", entradaRedator, contextoExecucao)).saida as SaidaRedator;
    revisorSaida = (
      await agente(
        "revisor",
        { resposta: redatorSaida.resposta, contexto, regras: textoRegrasRevisor },
        contextoExecucao
      )
    ).saida as SaidaRevisor;

    let voltas = 0;
    while (!revisorSaida.aprovado && voltas < 2) {
      voltas += 1;
      entradaRedator = { ...entradaRedator, ajustes: revisorSaida.motivos };
      redatorSaida = (await agente("redator", entradaRedator, contextoExecucao)).saida as SaidaRedator;
      revisorSaida = (
        await agente(
          "revisor",
          { resposta: redatorSaida.resposta, contexto, regras: textoRegrasRevisor },
          contextoExecucao
        )
      ).saida as SaidaRevisor;
    }
  } catch (erro) {
    await marcarRaizErro((erro as Error).message);
    throw erro;
  }

  const nomeCliente =
    (clienteParaAgentes as { nome?: string }).nome ?? pedido.cod_cliente;

  await supabase.from("aprovacoes").insert({
    area: "vendas",
    item_tipo: "pedido",
    item_id: cod_pedido,
    titulo: `${nomeCliente} · ${redatorSaida.resumo}`,
    proposta: { resposta: redatorSaida.resposta, triagem, contexto, revisao: revisorSaida },
    status: "pendente",
  });
  await supabase.from("TB_PEDIDOS").update({ status: "aguardando_aprovacao" }).eq("cod_pedido", cod_pedido);

  await fecharRaiz();

  return { triagem, contexto, redator: redatorSaida, revisor: revisorSaida };
}
