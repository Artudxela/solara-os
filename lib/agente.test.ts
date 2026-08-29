import { describe, it, expect, vi, beforeEach } from "vitest";
import { criarSupabaseMock } from "@/lib/testes/mockSupabase";

const { mockGenerateContent } = vi.hoisted(() => ({ mockGenerateContent: vi.fn() }));
const { mockCriarClienteAdmin } = vi.hoisted(() => ({ mockCriarClienteAdmin: vi.fn() }));

vi.mock("@google/genai", () => ({
  // precisa ser "function", nao arrow function: o codigo real chama `new GoogleGenAI(...)`,
  // e arrow functions nao podem ser usadas como construtoras em JS.
  GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAIMock() {
    return { models: { generateContent: mockGenerateContent } };
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  criarClienteAdmin: mockCriarClienteAdmin,
}));

import { agente } from "@/lib/agente";

describe("agente()", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockCriarClienteAdmin.mockReset();
  });

  it("grava rodando no inicio, chama o Gemini com o system prompt do arquivo, faz JSON.parse e grava ok com os tokens no fim", async () => {
    const supabaseMock = criarSupabaseMock({
      execucoes_agentes: [
        { data: { id: "exec-1" }, error: null },
        { data: null, error: null },
      ],
    });
    mockCriarClienteAdmin.mockReturnValue(supabaseMock);
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ tipo: "orcamento", itens: [] }),
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 40 },
    });

    const resultado = await agente(
      "triador",
      { mensagem: "oi", canal: "whatsapp", cliente: { cod_cliente: "C001", nome: "X", segmento: "Y" } },
      { area: "vendas", item_tipo: "pedido", item_id: "PED001" }
    );

    expect(resultado.execucao_id).toBe("exec-1");
    expect(resultado.saida).toEqual({ tipo: "orcamento", itens: [] });

    const chamadaInsert = supabaseMock.chamadas.find(
      (c) => c.metodo === "insert" && c.tabela === "execucoes_agentes"
    );
    expect(chamadaInsert?.args[0]).toMatchObject({
      agente: "triador",
      status: "rodando",
      area: "vendas",
      item_id: "PED001",
      chamado_por: null,
    });

    const chamadaUpdate = supabaseMock.chamadas
      .filter((c) => c.metodo === "update" && c.tabela === "execucoes_agentes")
      .pop();
    expect(chamadaUpdate?.args[0]).toMatchObject({
      status: "ok",
      saida: { tipo: "orcamento", itens: [] },
      tokens_entrada: 120,
      tokens_saida: 40,
    });

    const argsChamadaGemini = mockGenerateContent.mock.calls[0][0];
    expect(argsChamadaGemini.model).toBe("gemini-2.5-flash");
    expect(argsChamadaGemini.config.systemInstruction).toContain("Triador de pedidos");
    expect(argsChamadaGemini.config.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it("marca status erro e lanca excecao quando a resposta do Gemini nao e JSON valido (ex.: vem com crase de markdown)", async () => {
    const supabaseMock = criarSupabaseMock({
      execucoes_agentes: [
        { data: { id: "exec-2" }, error: null },
        { data: null, error: null },
      ],
    });
    mockCriarClienteAdmin.mockReturnValue(supabaseMock);
    mockGenerateContent.mockResolvedValue({
      text: '```json\n{"tipo": "orcamento"}\n```',
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    });

    await expect(
      agente(
        "triador",
        { mensagem: "x", canal: "y", cliente: {} },
        { area: "vendas", item_tipo: "pedido", item_id: "PED002" }
      )
    ).rejects.toThrow(/nao e JSON valido/);

    const chamadaUpdate = supabaseMock.chamadas.find(
      (c) => c.metodo === "update" && c.tabela === "execucoes_agentes"
    );
    expect(chamadaUpdate?.args[0]).toMatchObject({ status: "erro" });
    expect((chamadaUpdate?.args[0] as { erro: string }).erro).toContain("nao e JSON valido");
  });

  it("marca status erro e lanca excecao quando a chamada a API Gemini falha", async () => {
    const supabaseMock = criarSupabaseMock({
      execucoes_agentes: [
        { data: { id: "exec-3" }, error: null },
        { data: null, error: null },
      ],
    });
    mockCriarClienteAdmin.mockReturnValue(supabaseMock);
    mockGenerateContent.mockRejectedValue(new Error("503 overloaded"));

    await expect(
      agente(
        "triador",
        { mensagem: "x", canal: "y", cliente: {} },
        { area: "vendas", item_tipo: "pedido", item_id: "PED003" }
      )
    ).rejects.toThrow(/Falha ao chamar a API Gemini/);

    const chamadaUpdate = supabaseMock.chamadas.find(
      (c) => c.metodo === "update" && c.tabela === "execucoes_agentes"
    );
    expect(chamadaUpdate?.args[0]).toMatchObject({ status: "erro" });
  });

  it("marca status erro e lanca excecao quando o arquivo de prompt nao existe para a combinacao area/papel", async () => {
    const supabaseMock = criarSupabaseMock({
      execucoes_agentes: [
        { data: { id: "exec-4" }, error: null },
        { data: null, error: null },
      ],
    });
    mockCriarClienteAdmin.mockReturnValue(supabaseMock);

    // "investigador" so existe em prompts/financeiro/, nao em prompts/vendas/
    await expect(
      agente("investigador", {}, { area: "vendas", item_tipo: "pedido", item_id: "PED004" })
    ).rejects.toThrow(/Nao foi possivel ler o prompt/);

    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("lanca excecao (sem marcar erro, pois ainda nao ha execucao_id) quando o insert inicial em execucoes_agentes falha", async () => {
    const supabaseMock = criarSupabaseMock({
      execucoes_agentes: [{ data: null, error: { message: "conexao recusada" } }],
    });
    mockCriarClienteAdmin.mockReturnValue(supabaseMock);

    await expect(
      agente("triador", {}, { area: "vendas", item_tipo: "pedido", item_id: "PED005" })
    ).rejects.toThrow(/Falha ao registrar execucao/);

    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});
