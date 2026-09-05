import { NextResponse } from "next/server";
import { exigirAutenticado } from "@/lib/supabase/exigirAutenticado";

export async function exigirArea(area: "vendas" | "financeiro") {
  const resultado = await exigirAutenticado();
  if ("erro" in resultado) return resultado;

  const { user, supabaseSessao } = resultado;

  const { data: perfil } = await supabaseSessao
    .from("TB_PERFIS")
    .select("areas")
    .eq("id", user.id)
    .single();

  const areas: string[] = perfil?.areas ?? [];
  if (!areas.includes(area)) {
    return {
      erro: NextResponse.json({ erro: `Sem acesso à área ${area}.` }, { status: 403 }),
    } as const;
  }

  return { user } as const;
}
