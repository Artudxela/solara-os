"use client";

import { useEffect, useState, type FormEvent } from "react";
import { criarClienteNavegador } from "@/lib/supabase/client";
import Organograma from "@/components/Organograma";
import FilaAprovacao from "@/components/FilaAprovacao";
import LinhaDoTempo from "@/components/LinhaDoTempo";

type Pedido = {
  cod_pedido: string;
  data: string;
  cod_cliente: string;
  canal: string;
  mensagem: string;
  status: string;
};

const COLUNAS: { chave: string; titulo: string }[] = [
  { chave: "novo", titulo: "Novo" },
  { chave: "processando", titulo: "Processando" },
  { chave: "aguardando_aprovacao", titulo: "Aguardando aprovação" },
  { chave: "respondido", titulo: "Respondido" },
  { chave: "rejeitado", titulo: "Rejeitado" },
];

const CANAIS = ["e-mail", "whatsapp", "telefone"];

function FormularioNovoPedido({
  clientes,
  onCriado,
  onFechar,
}: {
  clientes: Record<string, string>;
  onCriado: () => void;
  onFechar: () => void;
}) {
  const [codCliente, setCodCliente] = useState("");
  const [canal, setCanal] = useState(CANAIS[0]);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const clientesOrdenados = Object.entries(clientes).sort((a, b) => a[1].localeCompare(b[1]));

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (!codCliente || !mensagem.trim()) {
      setErro("Selecione o cliente e escreva a mensagem.");
      return;
    }

    setEnviando(true);
    try {
      const resposta = await fetch("/api/vendas/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cod_cliente: codCliente, canal, mensagem }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro ?? "Erro ao criar pedido.");
        return;
      }
      onCriado();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <form
        onSubmit={salvar}
        className="flex w-full max-w-sm flex-col gap-3 rounded border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-950"
      >
        <h2 className="font-semibold">Novo pedido</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="cliente" className="text-sm">
            Cliente
          </label>
          <select
            id="cliente"
            value={codCliente}
            onChange={(e) => setCodCliente(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Selecione...</option>
            {clientesOrdenados.map(([cod, nome]) => (
              <option key={cod} value={cod}>
                {nome}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="canal" className="text-sm">
            Canal
          </label>
          <select
            id="canal"
            value={canal}
            onChange={(e) => setCanal(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {CANAIS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="mensagem" className="text-sm">
            Mensagem
          </label>
          <textarea
            id="mensagem"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={5}
            className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={enviando}
            onClick={onFechar}
            className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-zinc-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {enviando ? "Criando..." : "Criar pedido"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function VendasApp() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Record<string, string>>({});
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [processando, setProcessando] = useState<string | null>(null);
  const [aba, setAba] = useState<"kanban" | "aprovacoes">("kanban");
  const [novoPedidoAberto, setNovoPedidoAberto] = useState(false);

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

  function selecionar(codPedido: string) {
    setSelecionado(codPedido);
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

      <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 dark:border-zinc-800">
        <div className="flex gap-4">
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
        {aba === "kanban" && (
          <button
            onClick={() => setNovoPedidoAberto(true)}
            className="rounded bg-black px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black"
          >
            Novo pedido
          </button>
        )}
      </div>

      {novoPedidoAberto && (
        <FormularioNovoPedido
          clientes={clientes}
          onFechar={() => setNovoPedidoAberto(false)}
          onCriado={() => setNovoPedidoAberto(false)}
        />
      )}

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
            <LinhaDoTempo item_id={pedidoSelecionado.cod_pedido} />
          </div>
        )}
      </div>
      )}
    </div>
  );
}
