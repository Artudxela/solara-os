"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/client";

type StatusExecucao = "rodando" | "ok" | "erro";

type Execucao = {
  id: string;
  area: string;
  item_tipo: string;
  item_id: string;
  agente: string;
  chamado_por: string | null;
  status: StatusExecucao;
  entrada: unknown;
  saida: unknown;
  erro: string | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  inicio: string | null;
  fim: string | null;
};

const AGENTES_POR_AREA: Record<string, string[]> = {
  vendas: ["triador", "pesquisador", "redator", "revisor"],
  financeiro: ["investigador", "consolidador", "revisor"],
};

const NOMES: Record<string, string> = {
  orquestrador: "Orquestrador",
  triador: "Triador",
  pesquisador: "Pesquisador",
  redator: "Redator",
  revisor: "Revisor",
  investigador: "Investigador",
  consolidador: "Consolidador",
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

function classeCartao(status: StatusExecucao | "vazio"): string {
  switch (status) {
    case "vazio":
      return "bg-zinc-100 border-zinc-200 text-zinc-400 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-600";
    case "rodando":
      return "bg-blue-100 border-blue-300 text-blue-800 animate-pulse dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200";
    case "ok":
      return "bg-emerald-100 border-emerald-400 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-700 dark:text-emerald-200";
    case "erro":
      return "bg-red-100 border-red-400 text-red-900 dark:bg-red-950 dark:border-red-700 dark:text-red-200";
  }
}

function Cartao({
  titulo,
  status,
  detalhe,
}: {
  titulo: string;
  status: StatusExecucao | "vazio";
  detalhe?: string;
}) {
  return (
    <div
      className={`flex w-32 flex-col items-center gap-1 rounded border px-2 py-3 text-center text-xs ${classeCartao(status)}`}
    >
      <span className="font-medium">{titulo}</span>
      {detalhe && <span>{detalhe}</span>}
    </div>
  );
}

export default function Organograma({
  area,
  item_id,
}: {
  area: "vendas" | "financeiro";
  item_id: string;
}) {
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [setaVermelha, setSetaVermelha] = useState(false);
  const ultimaRevisaoId = useRef<string | null>(null);

  useEffect(() => {
    const supabase = criarClienteNavegador();
    let ativo = true;

    supabase
      .from("execucoes_agentes")
      .select("*")
      .eq("item_id", item_id)
      .then(({ data }) => {
        if (ativo && data) setExecucoes(data as Execucao[]);
      });

    const canal = supabase
      .channel(`execucoes_agentes_${item_id}`)
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
            return existe
              ? atual.map((e) => (e.id === nova.id ? nova : e))
              : [...atual, nova];
          });

          if (nova.agente === "revisor" && nova.status === "ok" && nova.id !== ultimaRevisaoId.current) {
            const saida = nova.saida as { aprovado?: boolean } | null;
            if (saida?.aprovado === false) {
              ultimaRevisaoId.current = nova.id;
              setSetaVermelha(true);
              setTimeout(() => setSetaVermelha(false), 3000);
            }
          }
        }
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [item_id]);

  const orquestrador = useMemo(
    () => execucoes.find((e) => e.agente === "orquestrador"),
    [execucoes]
  );

  const agentesArea = AGENTES_POR_AREA[area];

  function cartaoOrquestrador() {
    const status: StatusExecucao | "vazio" = orquestrador?.status ?? "vazio";
    const detalhe = orquestrador?.status === "ok" ? tempoSegundos(orquestrador) ?? undefined : undefined;
    return <Cartao titulo="Orquestrador" status={status} detalhe={detalhe} />;
  }

  function cartaoAgente(nome: string) {
    if (area === "financeiro" && nome === "investigador") {
      const doAgente = execucoes.filter((e) => e.agente === "investigador");
      const rodando = doAgente.filter((e) => e.status === "rodando").length;
      const concluidos = doAgente.filter((e) => e.status === "ok").length;
      const temErro = doAgente.some((e) => e.status === "erro");
      const status: StatusExecucao | "vazio" =
        doAgente.length === 0
          ? "vazio"
          : temErro
            ? "erro"
            : rodando > 0
              ? "rodando"
              : "ok";
      return (
        <Cartao
          titulo="Investigador"
          status={status}
          detalhe={doAgente.length > 0 ? `${rodando} rodando / ${concluidos} concluídos` : undefined}
        />
      );
    }

    const doAgente = execucoes
      .filter((e) => e.agente === nome)
      .sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? ""));
    const ultima = doAgente.at(-1);
    const status: StatusExecucao | "vazio" = ultima?.status ?? "vazio";
    const detalhe =
      ultima?.status === "ok"
        ? [tempoSegundos(ultima), tokensTotal(ultima) != null ? `${tokensTotal(ultima)} tok` : null]
            .filter(Boolean)
            .join(" · ")
        : undefined;
    return <Cartao titulo={NOMES[nome]} status={status} detalhe={detalhe || undefined} />;
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      {cartaoOrquestrador()}
      <div className="flex items-end gap-4">
        {agentesArea.map((nome, indice) => {
          const proximo = agentesArea[indice + 1];
          const mostrarSetaReprovacao =
            area === "vendas" && nome === "redator" && proximo === "revisor";
          return (
            <div key={nome} className="flex items-end gap-4">
              <div className="flex flex-col items-center gap-1">
                <span className="text-zinc-300 dark:text-zinc-700">↑</span>
                {cartaoAgente(nome)}
              </div>
              {mostrarSetaReprovacao && (
                <span
                  className={`pb-8 text-xl transition-colors ${
                    setaVermelha ? "text-red-500" : "text-zinc-300 dark:text-zinc-700"
                  }`}
                  title="revisor reprova e devolve ao redator"
                >
                  ⇄
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
