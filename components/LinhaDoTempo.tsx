"use client";

import { useEffect, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/client";

type StatusExecucao = "rodando" | "ok" | "erro";

type Execucao = {
  id: string;
  agente: string;
  status: StatusExecucao;
  entrada: unknown;
  saida: unknown;
  erro: string | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  inicio: string | null;
  fim: string | null;
};

function tempoSegundos(execucao: Execucao): string | null {
  if (!execucao.inicio || !execucao.fim) return null;
  const segundos =
    (new Date(execucao.fim).getTime() - new Date(execucao.inicio).getTime()) / 1000;
  return `${segundos.toFixed(1)}s`;
}

function tokensTotal(execucao: Execucao): number | null {
  if (execucao.tokens_entrada == null && execucao.tokens_saida == null) return null;
  return (execucao.tokens_entrada ?? 0) + (execucao.tokens_saida ?? 0);
}

function corStatus(status: StatusExecucao): string {
  switch (status) {
    case "rodando":
      return "text-blue-600 dark:text-blue-400";
    case "ok":
      return "text-emerald-600 dark:text-emerald-400";
    case "erro":
      return "text-red-600 dark:text-red-400";
  }
}

function ordenar(execucoes: Execucao[]): Execucao[] {
  return [...execucoes].sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? ""));
}

export default function LinhaDoTempo({ item_id }: { item_id: string }) {
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);

  useEffect(() => {
    const supabase = criarClienteNavegador();
    let ativo = true;

    supabase
      .from("execucoes_agentes")
      .select("*")
      .eq("item_id", item_id)
      .order("inicio", { ascending: true })
      .then(({ data }) => {
        if (ativo && data) setExecucoes(data as Execucao[]);
      });

    const canal = supabase
      .channel(`linha_do_tempo_${item_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "execucoes_agentes",
          filter: `item_id=eq.${item_id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const removida = payload.old as Execucao;
            setExecucoes((atual) => atual.filter((e) => e.id !== removida.id));
            return;
          }
          const nova = payload.new as Execucao;
          setExecucoes((atual) => {
            const existe = atual.some((e) => e.id === nova.id);
            const lista = existe
              ? atual.map((e) => (e.id === nova.id ? nova : e))
              : [...atual, nova];
            return ordenar(lista);
          });
        }
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [item_id]);

  if (execucoes.length === 0) {
    return <p className="text-xs text-zinc-400">Nenhuma execução ainda.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {execucoes.map((execucao) => (
        <details
          key={execucao.id}
          className="rounded border border-zinc-200 p-2 text-xs dark:border-zinc-800"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-2 font-medium">
            <span>{execucao.agente}</span>
            <span className={corStatus(execucao.status)}>{execucao.status}</span>
            <span className="text-zinc-500">
              {[tempoSegundos(execucao), tokensTotal(execucao) != null ? `${tokensTotal(execucao)} tok` : null]
                .filter(Boolean)
                .join(" · ") || "—"}
            </span>
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <div>
              <p className="font-semibold">Entrada</p>
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(execucao.entrada, null, 2)}
              </pre>
            </div>
            <div>
              <p className="font-semibold">Saída</p>
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(execucao.saida ?? { erro: execucao.erro }, null, 2)}
              </pre>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
