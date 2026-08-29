"use client";

import { useEffect, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/client";

type Aprovacao = {
  id: string;
  area: string;
  item_tipo: string;
  item_id: string;
  titulo: string;
  proposta: unknown;
  status: "pendente" | "aprovada" | "editada" | "rejeitada";
};

export default function FilaAprovacao({ area }: { area: "vendas" | "financeiro" }) {
  const [itens, setItens] = useState<Aprovacao[]>([]);
  const [selecionado, setSelecionado] = useState<Aprovacao | null>(null);
  const [textoEditado, setTextoEditado] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const supabase = criarClienteNavegador();

    supabase
      .from("aprovacoes")
      .select("*")
      .eq("area", area)
      .eq("status", "pendente")
      .then(({ data }) => {
        if (data) setItens(data as Aprovacao[]);
      });

    const canal = supabase
      .channel(`aprovacoes_${area}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "aprovacoes", filter: `area=eq.${area}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const removida = payload.old as Aprovacao;
            setItens((atual) => atual.filter((a) => a.id !== removida.id));
            return;
          }
          const nova = payload.new as Aprovacao;
          setItens((atual) => {
            if (nova.status !== "pendente") return atual.filter((a) => a.id !== nova.id);
            const existe = atual.some((a) => a.id === nova.id);
            return existe ? atual.map((a) => (a.id === nova.id ? nova : a)) : [...atual, nova];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [area]);

  function abrir(item: Aprovacao) {
    setSelecionado(item);
    setTextoEditado(JSON.stringify(item.proposta, null, 2));
    setObservacao("");
  }

  async function decidir(decisao: "aprovada" | "editada" | "rejeitada") {
    if (!selecionado) return;
    if (decisao === "rejeitada" && !observacao.trim()) {
      alert("Informe uma observação para rejeitar.");
      return;
    }
    setEnviando(true);
    try {
      const resposta = await fetch(`/api/aprovacoes/${selecionado.id}/decidir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisao,
          texto_editado: decisao === "editada" ? textoEditado : undefined,
          observacao,
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        alert(`Erro: ${dados.erro}`);
        return;
      }
      setSelecionado(null);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-1 gap-4 overflow-hidden p-4">
      <div className="flex w-72 flex-shrink-0 flex-col gap-2 overflow-y-auto">
        {itens.length === 0 && <p className="text-sm text-zinc-400">Nenhuma aprovação pendente.</p>}
        {itens.map((item) => (
          <button
            key={item.id}
            onClick={() => abrir(item)}
            className={`rounded border p-2 text-left text-xs ${
              selecionado?.id === item.id
                ? "border-zinc-900 dark:border-zinc-100"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            {item.titulo}
          </button>
        ))}
      </div>

      {selecionado && (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <h3 className="font-semibold">{selecionado.titulo}</h3>
          <textarea
            value={textoEditado}
            onChange={(evento) => setTextoEditado(evento.target.value)}
            rows={14}
            className="rounded border border-zinc-300 p-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            value={observacao}
            onChange={(evento) => setObservacao(evento.target.value)}
            placeholder="Observação (obrigatória para rejeitar)"
            className="rounded border border-zinc-300 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="flex gap-2">
            <button
              disabled={enviando}
              onClick={() => decidir("aprovada")}
              className="rounded bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Aprovar
            </button>
            <button
              disabled={enviando}
              onClick={() => decidir("editada")}
              className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Salvar edição e aprovar
            </button>
            <button
              disabled={enviando}
              onClick={() => decidir("rejeitada")}
              className="rounded bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Rejeitar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
