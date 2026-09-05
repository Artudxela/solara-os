import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import TrocarSenha from "@/components/TrocarSenha";

export default async function PaginaTrocarSenha() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4 p-8">
        <h1 className="text-xl font-semibold">Trocar senha</h1>
        <p className="text-sm text-zinc-500">
          Você está usando uma senha temporária. Defina uma nova senha para continuar.
        </p>
        <TrocarSenha />
      </div>
    </div>
  );
}
