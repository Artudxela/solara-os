import { describe, it, expect, vi, beforeEach } from "vitest";
import { criarSupabaseMock, type RespostaTabela } from "@/lib/testes/mockSupabase";

const { mockAgente } = vi.hoisted(() => ({ mockAgente: vi.fn() }));
const { mockCriarClienteAdmin } = vi.hoisted(() => ({ mockCriarClienteAdmin: vi.fn() }));

vi.mock("@/lib/agente", () => ({ agente: mockAgente }));
vi.mock("@/lib/supabase/admin", () => ({ criarClienteAdmin: mockCriarClienteAdmin }));

import { processarPedido } from "@/lib/orquestradores/vendas";

const PEDIDO_BASE = {
  cod_pedido: "PED001",
  data: "2026-08-24",
  cod_cliente: "C001",
  canal: "e-mail",
  mensagem: "Preciso de 200 parafusos sextavados 3/8",
  status: "novo",
};

const CLIENTE_BASE = {
  cod_cliente: "C001",
  nome: "Metalúrgica Andrade",
  cidade: "Contagem",
  segmento: "Indústria",
  prazo_pagamento_dias: 28,
  desconto_maximo_pct: 5,
  cliente_desde: "2016-03-10",
};

const TRIAGEM_ORCAMENTO = {
  tipo: "orcamento",
  itens: [{ descricao_cliente: "parafusos sextavados 3/8", quantidade: 200, unidade: "un" }],
  prazo_desejado: "semana que vem",
  pede_desconto: false,
  desconto_pedido_pct: null,
  urgencia: "normal",
  observacoes: "",
};

const CONTEXTO_PESQUISADOR = {
  itens: [
    {
      descricao_cliente: "parafusos sextavados 3/8",
      cod_produto: "P001",
      descricao: "Parafuso sextavado 3/8",
      quantidade: 200,
      unidade: "un",
      existe: true,
      preco_aplicado: 0.85,
      estoque: 340,
      atende_estoque: true,
      prazo_reposicao_dias: 5,
    },
  ],
  condicao_pagamento_dias: 28,
  desconto_maximo_pct: 5,
  observacoes: "",
};

/** Monta as respostas padrao de tabelas para o caminho "orcamento", na ordem em que sao consumidas. */
function respostasCaminhoOrcamento(): Record<string, RespostaTabela[]> {
  return {
    TB_PEDIDOS: [
      { data: PEDIDO_BASE, error: null }, // select do pedido
      { data: null, error: null }, // update -> processando
      { data: [], error: null }, // buscarPedidosAnteriores
      { data: null, error: null }, // update -> aguardando_aprovacao
    ],
    TB_CLIENTES: [{ data: CLIENTE_BASE, error: null }],
    TB_PRODUTO: [{ data: [], error: null }], // 1 item em triagem.itens
    execucoes_agentes: [
      { data: { id: "raiz-1" }, error: null }, // insert da execucao raiz
      { data: null, error: null }, // update final (fecharRaiz)
    ],
    aprovacoes: [{ data: null, error: null }],
  };
}

describe("processarPedido() — orquestrador de Vendas", () => {
  beforeEach(() => {
    mockAgente.mockReset();
    mockCriarClienteAdmin.mockReset();
  });

  it("quando o Triador classifica como spam, cria aprovacao 'Nao e orcamento' e nao chama Pesquisador/Redator/Revisor", async () => {
    const supabaseMock = criarSupabaseMock({
      TB_PEDIDOS: [
        { data: PEDIDO_BASE, error: null },
        { data: null, error: null }, // update -> processando
        { data: null, error: null }, // update -> aguardando_aprovacao
      ],
      TB_CLIENTES: [{ data: CLIENTE_BASE, error: null }],
      execucoes_agentes: [
        { data: { id: "raiz-1" }, error: null },
        { data: null, error: null },
      ],
      aprovacoes: [{ data: null, error: null }],
    });
    mockCriarClienteAdmin.mockReturnValue(supabaseMock);

    mockAgente.mockResolvedValueOnce({
      saida: { ...TRIAGEM_ORCAMENTO, tipo: "spam", itens: [], observacoes: "propaganda" },
      execucao_id: "exec-triador",
    });

    const resultado = await processarPedido("PED001");

    expect(mockAgente).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({ triagem: { ...TRIAGEM_ORCAMENTO, tipo: "spam", itens: [], observacoes: "propaganda" } });

    const insertAprovacao = supabaseMock.chamadas.find((c) => c.tabela === "aprovacoes" && c.metodo === "insert");
    expect(insertAprovacao?.args[0]).toMatchObject({
      titulo: "Não é orçamento: spam",
      status: "pendente",
    });

    const updates = supabaseMock.chamadas.filter((c) => c.tabela === "TB_PEDIDOS" && c.metodo === "update");
    expect(updates.map((u) => u.args[0])).toEqual([{ status: "processando" }, { status: "aguardando_aprovacao" }]);
  });

  it("quando o Revisor aprova de primeira, roda Triador -> Pesquisador -> Redator -> Revisor uma vez cada e cria a aprovacao", async () => {
    const supabaseMock = criarSupabaseMock(respostasCaminhoOrcamento());
    mockCriarClienteAdmin.mockReturnValue(supabaseMock);

    mockAgente
      .mockResolvedValueOnce({ saida: TRIAGEM_ORCAMENTO, execucao_id: "exec-triador" })
      .mockResolvedValueOnce({ saida: CONTEXTO_PESQUISADOR, execucao_id: "exec-pesquisador" })
      .mockResolvedValueOnce({
        saida: { resposta: "Prezada Metalúrgica Andrade...", resumo: "200 parafusos 3/8" },
        execucao_id: "exec-redator-1",
      })
      .mockResolvedValueOnce({ saida: { aprovado: true, motivos: [] }, execucao_id: "exec-revisor-1" });

    const resultado = await processarPedido("PED001");

    expect(mockAgente).toHaveBeenCalledTimes(4);
    expect(mockAgente.mock.calls.map((c) => c[0])).toEqual(["triador", "pesquisador", "redator", "revisor"]);
    expect(resultado.revisor).toEqual({ aprovado: true, motivos: [] });

    const insertAprovacao = supabaseMock.chamadas.find((c) => c.tabela === "aprovacoes" && c.metodo === "insert");
    expect(insertAprovacao?.args[0]).toMatchObject({
      titulo: "Metalúrgica Andrade · 200 parafusos 3/8",
      status: "pendente",
    });
    const proposta = (insertAprovacao?.args[0] as { proposta: { revisao: unknown } }).proposta;
    expect(proposta.revisao).toEqual({ aprovado: true, motivos: [] });

    const updates = supabaseMock.chamadas.filter((c) => c.tabela === "TB_PEDIDOS" && c.metodo === "update");
    expect(updates.at(-1)?.args[0]).toEqual({ status: "aguardando_aprovacao" });
  });

  it("quando o Revisor reprova, chama o Redator de novo com os motivos como ajustes, e aprova na segunda volta", async () => {
    const supabaseMock = criarSupabaseMock(respostasCaminhoOrcamento());
    mockCriarClienteAdmin.mockReturnValue(supabaseMock);

    const motivosReprovacao = ["Oferece 15% de desconto; o limite do cliente e 5%."];

    mockAgente
      .mockResolvedValueOnce({ saida: TRIAGEM_ORCAMENTO, execucao_id: "exec-triador" })
      .mockResolvedValueOnce({ saida: CONTEXTO_PESQUISADOR, execucao_id: "exec-pesquisador" })
      .mockResolvedValueOnce({
        saida: { resposta: "Resposta com 15% de desconto", resumo: "200 parafusos 3/8" },
        execucao_id: "exec-redator-1",
      })
      .mockResolvedValueOnce({ saida: { aprovado: false, motivos: motivosReprovacao }, execucao_id: "exec-revisor-1" })
      .mockResolvedValueOnce({
        saida: { resposta: "Resposta corrigida sem desconto indevido", resumo: "200 parafusos 3/8" },
        execucao_id: "exec-redator-2",
      })
      .mockResolvedValueOnce({ saida: { aprovado: true, motivos: [] }, execucao_id: "exec-revisor-2" });

    const resultado = await processarPedido("PED001");

    expect(mockAgente).toHaveBeenCalledTimes(6);
    expect(mockAgente.mock.calls.map((c) => c[0])).toEqual([
      "triador",
      "pesquisador",
      "redator",
      "revisor",
      "redator",
      "revisor",
    ]);

    // a 2a chamada ao redator deve levar os motivos do revisor como "ajustes"
    const entradaSegundoRedator = mockAgente.mock.calls[4][1] as { ajustes?: string[] };
    expect(entradaSegundoRedator.ajustes).toEqual(motivosReprovacao);

    expect(resultado.redator?.resposta).toBe("Resposta corrigida sem desconto indevido");
    expect(resultado.revisor).toEqual({ aprovado: true, motivos: [] });

    const insertAprovacao = supabaseMock.chamadas.find((c) => c.tabela === "aprovacoes" && c.metodo === "insert");
    const propostaFinal = (insertAprovacao?.args[0] as { proposta: { resposta: string } }).proposta;
    expect(propostaFinal.resposta).toBe("Resposta corrigida sem desconto indevido");
  });

  it("reprova nas duas voltas permitidas e ainda assim segue para a fila, com os motivos anexados", async () => {
    const supabaseMock = criarSupabaseMock(respostasCaminhoOrcamento());
    mockCriarClienteAdmin.mockReturnValue(supabaseMock);

    mockAgente
      .mockResolvedValueOnce({ saida: TRIAGEM_ORCAMENTO, execucao_id: "exec-triador" })
      .mockResolvedValueOnce({ saida: CONTEXTO_PESQUISADOR, execucao_id: "exec-pesquisador" })
      .mockResolvedValueOnce({ saida: { resposta: "v1", resumo: "r" }, execucao_id: "exec-redator-1" })
      .mockResolvedValueOnce({ saida: { aprovado: false, motivos: ["motivo 1"] }, execucao_id: "exec-revisor-1" })
      .mockResolvedValueOnce({ saida: { resposta: "v2", resumo: "r" }, execucao_id: "exec-redator-2" })
      .mockResolvedValueOnce({ saida: { aprovado: false, motivos: ["motivo 2"] }, execucao_id: "exec-revisor-2" })
      .mockResolvedValueOnce({ saida: { resposta: "v3", resumo: "r" }, execucao_id: "exec-redator-3" })
      .mockResolvedValueOnce({ saida: { aprovado: false, motivos: ["motivo 3"] }, execucao_id: "exec-revisor-3" });

    const resultado = await processarPedido("PED001");

    // 1 triador + 1 pesquisador + 3 redator + 3 revisor = 8 (2 voltas no maximo, alem da 1a tentativa)
    expect(mockAgente).toHaveBeenCalledTimes(8);
    expect(resultado.revisor).toEqual({ aprovado: false, motivos: ["motivo 3"] });

    const insertAprovacao = supabaseMock.chamadas.find((c) => c.tabela === "aprovacoes" && c.metodo === "insert");
    const proposta = (insertAprovacao?.args[0] as { proposta: { revisao: { aprovado: boolean; motivos: string[] } } })
      .proposta;
    expect(proposta.revisao).toEqual({ aprovado: false, motivos: ["motivo 3"] });

    // mesmo reprovado, o pedido segue para aguardando_aprovacao (nao fica travado)
    const updates = supabaseMock.chamadas.filter((c) => c.tabela === "TB_PEDIDOS" && c.metodo === "update");
    expect(updates.at(-1)?.args[0]).toEqual({ status: "aguardando_aprovacao" });
  });

  it("quando o Triador classifica como complemento, segue o pipeline completo (nao entra no early-exit de 'nao e orcamento')", async () => {
    const supabaseMock = criarSupabaseMock(respostasCaminhoOrcamento());
    mockCriarClienteAdmin.mockReturnValue(supabaseMock);

    mockAgente
      .mockResolvedValueOnce({ saida: { ...TRIAGEM_ORCAMENTO, tipo: "complemento" }, execucao_id: "exec-triador" })
      .mockResolvedValueOnce({ saida: CONTEXTO_PESQUISADOR, execucao_id: "exec-pesquisador" })
      .mockResolvedValueOnce({
        saida: { resposta: "Complementando a proposta anterior...", resumo: "complemento do pedido" },
        execucao_id: "exec-redator-1",
      })
      .mockResolvedValueOnce({ saida: { aprovado: true, motivos: [] }, execucao_id: "exec-revisor-1" });

    const resultado = await processarPedido("PED001");

    expect(mockAgente).toHaveBeenCalledTimes(4);
    expect(mockAgente.mock.calls.map((c) => c[0])).toEqual(["triador", "pesquisador", "redator", "revisor"]);
    expect(resultado.revisor).toEqual({ aprovado: true, motivos: [] });

    const insertAprovacao = supabaseMock.chamadas.find((c) => c.tabela === "aprovacoes" && c.metodo === "insert");
    expect(insertAprovacao?.args[0]).toMatchObject({
      titulo: "Metalúrgica Andrade · complemento do pedido",
      status: "pendente",
    });
    expect(insertAprovacao?.args[0]).not.toMatchObject({ titulo: "Não é orçamento: complemento" });

    const updates = supabaseMock.chamadas.filter((c) => c.tabela === "TB_PEDIDOS" && c.metodo === "update");
    expect(updates.at(-1)?.args[0]).toEqual({ status: "aguardando_aprovacao" });
  });

  it("quando o Triador falha, marca a execucao raiz como erro e propaga a excecao sem tocar em aprovacoes", async () => {
    const supabaseMock = criarSupabaseMock({
      TB_PEDIDOS: [{ data: PEDIDO_BASE, error: null }, { data: null, error: null }],
      TB_CLIENTES: [{ data: CLIENTE_BASE, error: null }],
      execucoes_agentes: [{ data: { id: "raiz-1" }, error: null }, { data: null, error: null }],
    });
    mockCriarClienteAdmin.mockReturnValue(supabaseMock);

    mockAgente.mockRejectedValueOnce(new Error("Falha ao chamar a API Gemini para triador: 503"));

    await expect(processarPedido("PED001")).rejects.toThrow(/Falha ao chamar a API Gemini/);

    const updateRaiz = supabaseMock.chamadas.find(
      (c) => c.tabela === "execucoes_agentes" && c.metodo === "update"
    );
    expect(updateRaiz?.args[0]).toMatchObject({ status: "erro" });

    const insertAprovacao = supabaseMock.chamadas.find((c) => c.tabela === "aprovacoes");
    expect(insertAprovacao).toBeUndefined();
  });

  it("lanca excecao quando o pedido nao existe", async () => {
    const supabaseMock = criarSupabaseMock({
      TB_PEDIDOS: [{ data: null, error: null }],
    });
    mockCriarClienteAdmin.mockReturnValue(supabaseMock);

    await expect(processarPedido("PED999")).rejects.toThrow(/nao encontrado/);
    expect(mockAgente).not.toHaveBeenCalled();
  });
});
