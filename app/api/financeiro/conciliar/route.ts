import { NextResponse } from "next/server";
import { conciliar } from "@/lib/orquestradores/financeiro";

export const maxDuration = 60;

export async function POST(request: Request) {
  const { extrato_id } = await request.json();

  if (!extrato_id || typeof extrato_id !== "string") {
    return NextResponse.json({ erro: "extrato_id e obrigatorio" }, { status: 400 });
  }

  try {
    const resultado = await conciliar(extrato_id);
    return NextResponse.json(resultado);
  } catch (erro) {
    return NextResponse.json({ erro: (erro as Error).message }, { status: 500 });
  }
}
