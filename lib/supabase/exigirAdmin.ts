import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

export async function exigirAdmin() {
  const supabaseSessao = await criarClienteServidor();
  const {
    data: { user },
  } = await supabaseSessao.auth.getUser();

  if (!user) {
    return { erro: NextResponse.json({ erro: "Não autenticado." }, { status: 401 }) } as const;
  }

  const { data: perfil } = await supabaseSessao
    .from("TB_PERFIS")
    .select("papel")
    .eq("id", user.id)
    .single();

  if (perfil?.papel !== "admin") {
    return {
      erro: NextResponse.json(
        { erro: "Apenas administradores podem gerenciar usuários." },
        { status: 403 }
      ),
    } as const;
  }

  return { user } as const;
}
