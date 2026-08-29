"use client";

import { useEffect, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/client";
import Organograma from "@/components/Organograma";
import FilaAprovacao from "@/components/FilaAprovacao";

type Pedido = {
  cod_pedido: string;
  data: string;
  cod_cliente: string;
  canal: string;
  mensagem: string;
  status: string;
};

type Execucao = {
  id: string;
  agente: string;
  status: "rodando" | "ok" | "erro";
  entrada: unknown;
  saida: unknown;
  erro: string | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  inicio: string | null;
  fim: string | null;
};

const COLUNAS: { chave: string; titulo: string }[] = [
  { chave: "novo", titulo: "Novo" },
  { chave: "processando", titulo: "Processando" },
  { chave: "aguardando_aprovacao", titulo: "Aguardando aprovação" },
  { chave: "respondido", titulo: "Respondido" },
  { chave: "rejeitado", titulo: "Rejeitado" },
];

export default function VendasApp() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Record<string, string>>({});
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [processando, setProcessando] = useState<string | null>(null);
  const [aba, setAba] = useState<"kanban" | "aprovacoes">("kanban");

  useEffect(() => {
    const supabase = criarClienteNavegador();

    supabase
      .from("TB_PEDIDOS")
      .select("*")
      .order("cod_pedido")
      .then(({ data }) => {
        if (data) setPedidos(data as Pedido[]);
      });

    supabase
      .from("TB_CLIENTES")
      .select("cod_cliente, nome")
      .then(({ data }) => {
        if (data) {
          const mapa: Record<string, string> = {};
          for (const c of data as { cod_cliente: string; nome: string }[]) {
            mapa[c.cod_cliente] = c.nome;
          }
          setClientes(mapa);
        }
      });

    const canal = supabase
      .channel("tb_pedidos_kanban")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "TB_PEDIDOS" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const removido = payload.old as Pedido;
            setPedidos((atual) => atual.filter((p) => p.cod_pedido !== removido.cod_pedido));
            return;
          }
          const novo = payload.new as Pedido;
          setPedidos((atual) => {
            const existe = atual.some((p) => p.cod_pedido === novo.cod_pedido);
            return existe
              ? atual.map((p) => (p.cod_pedido === novo.cod_pedido ? novo : p))
              : [...atual, novo];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  async function carregarExecucoes(codPedido: string) {
    const supabase = criarClienteNavegador();
    const { data } = await supabase
      .from("execucoes_agentes")
      .select("*")
      .eq("item_id", codPedido)
      .order("inicio", { ascending: true });
    setExecucoes((data as Execucao[]) ?? []);
  }

  function selecionar(codPedido: string) {
    setSelecionado(codPedido);
    carregarExecucoes(codPedido);
  }

  async function processar(codPedido: string) {
    setProcessando(codPedido);
    try {
      const resposta = await fetch("/api/vendas/processar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cod_pedido: codPedido }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        alert(`Erro ao processar ${codPedido}: ${dados.erro}`);
      }
    } finally {
      setProcessando(null);
      selecionar(codPedido);
    }
  }

  const pedidoSelecionado = pedidos.find((p) => p.cod_pedido === selecionado) ?? null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        {selecionado ? (
          <Organograma area="vendas" item_id={selecionado} />
        ) : (
          <p className="p-6 text-center text-sm text-zinc-400">
            Selecione um pedido para ver o organograma.
          </p>
        )}
      </div>

      <div className="flex gap-4 border-b border-zinc-200 px-4 dark:border-zinc-800">
        <button
          onClick={() => setAba("kanban")}
          className={`border-b-2 py-2 text-sm font-medium ${
            aba === "kanban" ? "border-zinc-900 dark:border-zinc-100" : "border-transparent text-zinc-500"
          }`}
        >
          Pedidos
        </button>
        <button
          onClick={() => setAba("aprovacoes")}
          className={`border-b-2 py-2 text-sm font-medium ${
            aba === "aprovacoes" ? "border-zinc-900 dark:border-zinc-100" : "border-transparent text-zinc-500"
          }`}
        >
          Aprovações
        </button>
      </div>

      {aba === "aprovacoes" && <FilaAprovacao area="vendas" />}

      {aba === "kanban" && (
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 gap-4 overflow-x-auto p-4">
          {COLUNAS.map((coluna) => (
            <div key={coluna.chave} className="flex w-64 flex-shrink-0 flex-col gap-2">
              <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                {coluna.titulo}
              </h3>
              <div className="flex flex-col gap-2">
                {pedidos
                  .filter((p) => p.status === coluna.chave)
                  .map((pedido) => (
                    <div
                      key={pedido.cod_pedido}
                      role="button"
                      tabIndex={0}
                      onClick={() => selecionar(pedido.cod_pedido)}
                      onKeyDown={(evento) => {
                        if (evento.key === "Enter" || evento.key === " ") {
                          selecionar(pedido.cod_pedido);
                        }
                      }}
                      className={`flex cursor-pointer flex-col gap-1 rounded border p-2 text-left text-xs ${
                        selecionado === pedido.cod_pedido
                          ? "border-zinc-900 dark:border-zinc-100"
                          : "border-zinc-200 dark:border-zinc-800"
                      }`}
                    >
                      <span className="font-medium">{pedido.cod_pedido}</span>
                      <span>{clientes[pedido.cod_cliente] ?? pedido.cod_cliente}</span>
                      <span className="text-zinc-500">
                        {pedido.canal} · {pedido.data}
                      </span>
                      <span className="text-zinc-500">{pedido.mensagem.slice(0, 80)}</span>
                      {pedido.status === "novo" && (
                        <button
                          onClick={(evento) => {
                            evento.stopPropagation();
                            processar(pedido.cod_pedido);
                          }}
                          className="mt-1 rounded bg-black px-2 py-1 text-center text-white dark:bg-white dark:text-black"
                        >
                          {processando === pedido.cod_pedido ? "Processando..." : "Processar"}
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {pedidoSelecionado && (
          <div className="flex w-96 flex-shrink-0 flex-col gap-3 overflow-y-auto border-l border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="font-semibold">{pedidoSelecionado.cod_pedido}</h2>
            <p className="text-xs text-zinc-500">
              {clientes[pedidoSelecionado.cod_cliente] ?? pedidoSelecionado.cod_cliente} ·{" "}
              {pedidoSelecionado.canal} · {pedidoSelecionado.data}
            </p>
            <p className="text-sm">{pedidoSelecionado.mensagem}</p>

            <h3 className="mt-2 text-sm font-semibold">Execuções</h3>
            {execucoes.length === 0 && (
              <p className="text-xs text-zinc-400">Nenhuma execução ainda.</p>
            )}
            {execucoes.map((execucao) => (
              <details
                key={execucao.id}
                className="rounded border border-zinc-200 p-2 text-xs dark:border-zinc-800"
              >
                <summary className="cursor-pointer font-medium">
                  {execucao.agente} · {execucao.status}
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-words">
                  {JSON.stringify(execucao.saida ?? execucao.erro, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
