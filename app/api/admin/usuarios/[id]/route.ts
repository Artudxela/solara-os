import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/supabase/exigirAdmin";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { erro } = await exigirAdmin();
  if (erro) return erro;

  const { nome, papel, areas } = (await request.json()) as {
    nome?: string;
    papel?: string;
    areas?: string[];
  };

  if (!nome || !papel) {
    return NextResponse.json({ erro: "Preencha nome e papel." }, { status: 400 });
  }
  if (!["admin", "operador"].includes(papel)) {
    return NextResponse.json({ erro: "Papel inválido." }, { status: 400 });
  }

  const admin = criarClienteAdmin();
  const { data: perfil, error: erroPerfil } = await admin
    .from("TB_PERFIS")
    .update({ nome, papel, areas: areas ?? [] })
    .eq("id", id)
    .select("id, email, nome, papel, areas, deve_trocar_senha")
    .single();

  if (erroPerfil) {
    return NextResponse.json({ erro: erroPerfil.message }, { status: 400 });
  }

  return NextResponse.json({ perfil });
}
