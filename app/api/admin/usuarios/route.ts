import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/supabase/exigirAdmin";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { erro } = await exigirAdmin();
  if (erro) return erro;

  const { email, senha, nome, papel, areas } = (await request.json()) as {
    email?: string;
    senha?: string;
    nome?: string;
    papel?: string;
    areas?: string[];
  };

  if (!email || !senha || !nome || !papel) {
    return NextResponse.json({ erro: "Preencha e-mail, senha, nome e papel." }, { status: 400 });
  }
  if (!["admin", "operador"].includes(papel)) {
    return NextResponse.json({ erro: "Papel inválido." }, { status: 400 });
  }
  if (senha.length < 6) {
    return NextResponse.json({ erro: "A senha precisa ter ao menos 6 caracteres." }, { status: 400 });
  }

  const admin = criarClienteAdmin();

  const { data: novoUsuario, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (erroAuth || !novoUsuario.user) {
    return NextResponse.json({ erro: erroAuth?.message ?? "Falha ao criar usuário." }, { status: 400 });
  }

  const { data: perfil, error: erroPerfil } = await admin
    .from("TB_PERFIS")
    .insert({
      id: novoUsuario.user.id,
      email,
      nome,
      papel,
      areas: areas ?? [],
    })
    .select("id, email, nome, papel, areas, deve_trocar_senha")
    .single();

  if (erroPerfil) {
    await admin.auth.admin.deleteUser(novoUsuario.user.id);
    return NextResponse.json({ erro: erroPerfil.message }, { status: 400 });
  }

  return NextResponse.json({ perfil });
}
