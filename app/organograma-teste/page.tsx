import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import Organograma from "@/components/Organograma";

export default async function OrganogramaTestePage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; item_id?: string }>;
}) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const area = params.area === "financeiro" ? "financeiro" : "vendas";
  const item_id = params.item_id ?? "TESTE1";

  return (
    <div className="flex flex-1 flex-col gap-4 p-8">
      <p className="text-sm text-zinc-500">
        Pagina temporaria para testar o Organograma antes de /vendas e /financeiro existirem.
        Troque a URL: ?area=vendas|financeiro&item_id=SEU_ID
      </p>
      <p className="text-sm font-medium">
        area: {area} · item_id: {item_id}
      </p>
      <Organograma area={area} item_id={item_id} />
    </div>
  );
}
