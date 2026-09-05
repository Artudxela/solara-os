import { redirect } from "next/navigation";
import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import AdminUsuarios, { type Perfil } from "@/components/AdminUsuarios";

export default async function PaginaAdmin() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("TB_PERFIS")
    .select("papel, deve_trocar_senha")
    .eq("id", user.id)
    .single();

  if (perfil?.deve_trocar_senha) {
    redirect("/trocar-senha");
  }

  if (perfil?.papel !== "admin") {
    redirect("/");
  }

  const admin = criarClienteAdmin();
  const { data: perfis } = await admin
    .from("TB_PERFIS")
    .select("id, email, nome, papel, areas, deve_trocar_senha")
    .order("email");

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Administração</h1>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          Voltar
        </Link>
      </div>
      <AdminUsuarios perfisIniciais={(perfis as Perfil[]) ?? []} />
    </div>
  );
}
