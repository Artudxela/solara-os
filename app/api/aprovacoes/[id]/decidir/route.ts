import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

type Decisao = "aprovada" | "editada" | "rejeitada";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { decisao, texto_editado, observacao } = (await request.json()) as {
    decisao: Decisao;
    texto_editado?: string;
    observacao?: string;
  };

  if (!["aprovada", "editada", "rejeitada"].includes(decisao)) {
    return NextResponse.json({ erro: "decisao invalida" }, { status: 400 });
  }
  if (decisao === "rejeitada" && !observacao?.trim()) {
    return NextResponse.json({ erro: "observacao e obrigatoria para rejeitar" }, { status: 400 });
  }

  const supabaseSessao = await criarClienteServidor();
  const {
    data: { user },
  } = await supabaseSessao.auth.getUser();

  const supabase = criarClienteAdmin();

  const { data: aprovacao, error: erroAprovacao } = await supabase
    .from("aprovacoes")
    .select("*")
    .eq("id", id)
    .single();

  if (erroAprovacao || !aprovacao) {
    return NextResponse.json({ erro: "Aprovacao nao encontrada" }, { status: 404 });
  }

  let novaProposta = aprovacao.proposta;
  if (decisao === "editada" && texto_editado) {
    try {
      novaProposta = JSON.parse(texto_editado);
    } catch {
      novaProposta = { ...aprovacao.proposta, texto_editado };
    }
  }

  await supabase
    .from("aprovacoes")
    .update({
      status: decisao,
      decidido_por: user?.id ?? null,
      decidido_em: new Date().toISOString(),
      observacao: observacao || null,
      proposta: novaProposta,
    })
    .eq("id", id);

  if (aprovacao.area === "vendas" && aprovacao.item_tipo === "pedido") {
    const novoStatus = decisao === "rejeitada" ? "rejeitado" : "respondido";
    await supabase.from("TB_PEDIDOS").update({ status: novoStatus }).eq("cod_pedido", aprovacao.item_id);
  }

  if (aprovacao.area === "financeiro" && aprovacao.item_tipo === "divergencia") {
    if (decisao === "rejeitada") {
      await supabase.from("divergencias").update({ status: "nova" }).eq("id", aprovacao.item_id);
    } else {
      await supabase.from("divergencias").update({ status: "resolvida" }).eq("id", aprovacao.item_id);

      const hipotese = novaProposta as {
        hipotese?: string;
        cod_titulos_envolvidos?: string[];
        valor_pendente?: number;
      };
      const codTitulos = hipotese.cod_titulos_envolvidos ?? [];
      const novoStatusTitulo =
        hipotese.hipotese === "vencido_sem_pagamento"
          ? "vencido"
          : hipotese.valor_pendente && hipotese.valor_pendente > 0
            ? "pago_parcial"
            : "pago";

      if (codTitulos.length > 0) {
        await supabase.from("TB_TITULOS").update({ status: novoStatusTitulo }).in("cod_titulo", codTitulos);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
