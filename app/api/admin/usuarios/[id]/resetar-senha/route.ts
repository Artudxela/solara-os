import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { exigirAdmin } from "@/lib/supabase/exigirAdmin";
import { criarClienteAdmin } from "@/lib/supabase/admin";

function gerarSenhaTemporaria(): string {
  return `Solara${randomBytes(4).toString("hex")}`;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { erro } = await exigirAdmin();
  if (erro) return erro;

  const senhaTemporaria = gerarSenhaTemporaria();
  const admin = criarClienteAdmin();

  const { error: erroAuth } = await admin.auth.admin.updateUserById(id, {
    password: senhaTemporaria,
  });
  if (erroAuth) {
    return NextResponse.json({ erro: erroAuth.message }, { status: 400 });
  }

  const { error: erroPerfil } = await admin
    .from("TB_PERFIS")
    .update({ deve_trocar_senha: true })
    .eq("id", id);

  if (erroPerfil) {
    return NextResponse.json({ erro: erroPerfil.message }, { status: 400 });
  }

  return NextResponse.json({ senha_temporaria: senhaTemporaria });
}
