import { NextResponse } from "next/server";
import { processarPedido } from "@/lib/orquestradores/vendas";
import { exigirArea } from "@/lib/supabase/exigirArea";

export const maxDuration = 60;

export async function POST(request: Request) {
  const acesso = await exigirArea("vendas");
  if ("erro" in acesso) return acesso.erro;

  const { cod_pedido } = await request.json();

  if (!cod_pedido || typeof cod_pedido !== "string") {
    return NextResponse.json({ erro: "cod_pedido e obrigatorio" }, { status: 400 });
  }

  try {
    const resultado = await processarPedido(cod_pedido);
    return NextResponse.json(resultado);
  } catch (erro) {
    return NextResponse.json({ erro: (erro as Error).message }, { status: 500 });
  }
}
