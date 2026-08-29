import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import VendasApp from "@/components/VendasApp";

export default async function VendasPage() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("TB_PERFIS")
    .select("areas")
    .eq("id", user.id)
    .single();

  const areas: string[] = perfil?.areas ?? [];

  if (!areas.includes("vendas")) {
    redirect("/");
  }

  return <VendasApp />;
}
