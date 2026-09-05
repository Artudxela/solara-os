import { redirect } from "next/navigation";
import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import BotaoSair from "@/components/BotaoSair";

const AREAS_EM_BREVE = [
  { chave: "rh", nome: "RH" },
  { chave: "juridico", nome: "Jurídico" },
  { chave: "operacoes", nome: "Operações" },
];

const AREAS_ATIVAS = [
  { chave: "vendas", nome: "Vendas", href: "/vendas" },
  { chave: "financeiro", nome: "Financeiro", href: "/financeiro" },
];

export default async function Home() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("TB_PERFIS")
    .select("areas, papel, deve_trocar_senha")
    .eq("id", user.id)
    .single();

  if (perfil?.deve_trocar_senha) {
    redirect("/trocar-senha");
  }

  const areasDoUsuario: string[] = perfil?.areas ?? [];
  const ehAdmin = perfil?.papel === "admin";

  return (
    <div className="flex flex-1 flex-col items-center gap-8 p-8">
      <div className="flex w-full max-w-3xl items-center justify-between">
        <h1 className="text-2xl font-semibold">Solara OS</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{user.email}</span>
          {ehAdmin && (
            <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
              Admin
            </Link>
          )}
          <BotaoSair />
        </div>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-2 gap-4 sm:grid-cols-3">
        {AREAS_ATIVAS.filter((area) => areasDoUsuario.includes(area.chave)).map((area) => (
          <Link
            key={area.chave}
            href={area.href}
            className="flex h-24 flex-col items-center justify-center rounded border border-zinc-300 text-center font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {area.nome}
          </Link>
        ))}
        {AREAS_EM_BREVE.map((area) => (
          <div
            key={area.chave}
            className="flex h-24 flex-col items-center justify-center gap-1 rounded border border-dashed border-zinc-200 text-center text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
          >
            <span className="font-medium">{area.nome}</span>
            <span className="text-xs">em breve</span>
          </div>
        ))}
      </div>
    </div>
  );
}
