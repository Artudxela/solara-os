import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabaseSessao = await criarClienteServidor();
  const {
    data: { user },
  } = await supabaseSessao.auth.getUser();

  if (!user) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  const { senha_nova } = (await request.json()) as { senha_nova?: string };

  if (!senha_nova || senha_nova.length < 6) {
    return NextResponse.json({ erro: "A senha precisa ter ao menos 6 caracteres." }, { status: 400 });
  }

  const admin = criarClienteAdmin();

  const { error: erroAuth } = await admin.auth.admin.updateUserById(user.id, {
    password: senha_nova,
  });
  if (erroAuth) {
    return NextResponse.json({ erro: erroAuth.message }, { status: 400 });
  }

  await admin.from("TB_PERFIS").update({ deve_trocar_senha: false }).eq("id", user.id);

  return NextResponse.json({ ok: true });
}
