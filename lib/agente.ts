import { GoogleGenAI } from "@google/genai";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export type PapelAgente =
  | "triador"
  | "pesquisador"
  | "redator"
  | "revisor"
  | "investigador"
  | "consolidador";

export type ContextoAgente = {
  area: "vendas" | "financeiro";
  item_tipo: "pedido" | "divergencia";
  item_id: string;
  chamado_por?: string;
};

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function agente(
  papel: PapelAgente,
  entrada: Record<string, unknown>,
  contexto: ContextoAgente
): Promise<{ saida: unknown; execucao_id: string }> {
  const supabase = criarClienteAdmin();

  const { data: execucao, error: erroInsercao } = await supabase
    .from("execucoes_agentes")
    .insert({
      area: contexto.area,
      item_tipo: contexto.item_tipo,
      item_id: contexto.item_id,
      agente: papel,
      chamado_por: contexto.chamado_por ?? null,
      status: "rodando",
      entrada,
      inicio: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (erroInsercao || !execucao) {
    throw new Error(
      `Falha ao registrar execucao do agente ${papel}: ${erroInsercao?.message}`
    );
  }

  const execucaoId = execucao.id as string;

  const marcarErro = async (mensagem: string) => {
    await supabase
      .from("execucoes_agentes")
      .update({ status: "erro", erro: mensagem, fim: new Date().toISOString() })
      .eq("id", execucaoId);
  };

  let systemPrompt: string;
  try {
    systemPrompt = await readFile(
      path.join(process.cwd(), "prompts", contexto.area, `${papel}.md`),
      "utf-8"
    );
  } catch (erro) {
    const mensagem = `Nao foi possivel ler o prompt de ${papel}: ${(erro as Error).message}`;
    await marcarErro(mensagem);
    throw new Error(mensagem);
  }

  let resposta;
  try {
    resposta = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: JSON.stringify(entrada) }] }],
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 2000,
        responseMimeType: "application/json",
      },
    });
  } catch (erro) {
    const mensagem = `Falha ao chamar a API Gemini para ${papel}: ${(erro as Error).message}`;
    await marcarErro(mensagem);
    throw new Error(mensagem);
  }

  const textoResposta = resposta.text ?? "";

  let saida: unknown;
  try {
    saida = JSON.parse(textoResposta);
  } catch {
    const mensagem = `Resposta do agente ${papel} nao e JSON valido: ${textoResposta.slice(0, 500)}`;
    await marcarErro(mensagem);
    throw new Error(mensagem);
  }

  await supabase
    .from("execucoes_agentes")
    .update({
      status: "ok",
      saida,
      tokens_entrada: resposta.usageMetadata?.promptTokenCount ?? null,
      tokens_saida: resposta.usageMetadata?.candidatesTokenCount ?? null,
      fim: new Date().toISOString(),
    })
    .eq("id", execucaoId);

  return { saida, execucao_id: execucaoId };
}
