import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import FinanceiroApp from "@/components/FinanceiroApp";

export default async function FinanceiroPage() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("TB_PERFIS")
    .select("areas, deve_trocar_senha")
    .eq("id", user.id)
    .single();

  if (perfil?.deve_trocar_senha) {
    redirect("/trocar-senha");
  }

  const areas: string[] = perfil?.areas ?? [];

  if (!areas.includes("financeiro")) {
    redirect("/");
  }

  return <FinanceiroApp />;
}
