import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

export async function exigirAutenticado() {
  const supabaseSessao = await criarClienteServidor();
  const {
    data: { user },
  } = await supabaseSessao.auth.getUser();

  if (!user) {
    return { erro: NextResponse.json({ erro: "Não autenticado." }, { status: 401 }) } as const;
  }

  return { user, supabaseSessao } as const;
}
