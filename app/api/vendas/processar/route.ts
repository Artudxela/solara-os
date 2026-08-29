import { NextResponse } from "next/server";
import { processarPedido } from "@/lib/orquestradores/vendas";

export const maxDuration = 60;

export async function POST(request: Request) {
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
