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
    .select("cod_cliente, nome, segmento")
    .eq("cod_cliente", pedido.cod_cliente)
    .single();

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

  const marcarRaizErro = async (mensagem: string) => {
    await supabase
      .from("execucoes_agentes")
      .update({ status: "erro", erro: mensagem, fim: new Date().toISOString() })
      .eq("id", raizId);
  };

  let triagem: SaidaTriador;
  try {
    const resultado = await agente(
      "triador",
      {
        mensagem: pedido.mensagem,
        canal: pedido.canal,
        cliente: cliente ?? { cod_cliente: pedido.cod_cliente, nome: null, segmento: null },
      },
      { area: "vendas", item_tipo: "pedido", item_id: cod_pedido, chamado_por: raizId }
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
  }

  await supabase
    .from("execucoes_agentes")
    .update({ status: "ok", fim: new Date().toISOString() })
    .eq("id", raizId);

  return { triagem };
}
