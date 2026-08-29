import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import BotaoSair from "@/components/BotaoSair";

export default async function Home() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Solara OS</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{user.email}</p>
      <BotaoSair />
    </div>
  );
}
