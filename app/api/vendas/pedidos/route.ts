import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { exigirArea } from "@/lib/supabase/exigirArea";

export async function POST(request: Request) {
  const acesso = await exigirArea("vendas");
  if ("erro" in acesso) return acesso.erro;

  const { cod_cliente, canal, mensagem } = (await request.json()) as {
    cod_cliente?: string;
    canal?: string;
    mensagem?: string;
  };

  if (!cod_cliente || !canal || !mensagem?.trim()) {
    return NextResponse.json({ erro: "Preencha cliente, canal e mensagem." }, { status: 400 });
  }

  const admin = criarClienteAdmin();

  const { data: ultimo } = await admin
    .from("TB_PEDIDOS")
    .select("cod_pedido")
    .order("cod_pedido", { ascending: false })
    .limit(1)
    .single();

  const ultimoNumero = ultimo?.cod_pedido ? parseInt(String(ultimo.cod_pedido).replace("PED", ""), 10) : 0;
  const codPedido = `PED${String(ultimoNumero + 1).padStart(3, "0")}`;

  const { data: pedido, error } = await admin
    .from("TB_PEDIDOS")
    .insert({
      cod_pedido: codPedido,
      data: new Date().toISOString().slice(0, 10),
      cod_cliente,
      canal,
      mensagem: mensagem.trim(),
      status: "novo",
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 400 });
  }

  return NextResponse.json({ pedido });
}
