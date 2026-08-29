"use client";

import { useRouter } from "next/navigation";
import { criarClienteNavegador } from "@/lib/supabase/client";

export default function BotaoSair() {
  const router = useRouter();

  async function sair() {
    const supabase = criarClienteNavegador();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={sair}
      className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
    >
      Sair
    </button>
  );
}
