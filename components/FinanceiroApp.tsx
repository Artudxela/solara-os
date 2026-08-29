"use client";

import { useEffect, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/client";
import Organograma from "@/components/Organograma";
import FilaAprovacao from "@/components/FilaAprovacao";

type LancamentoBatido = {
  cod_lancamento: string;
  data: string;
  descricao: string;
  valor: number;
  cod_titulo: string;
};

type LancamentoIgnorado = { cod_lancamento: string; data: string; descricao: string; valor: number };

type Divergencia = {
  id: string;
  tipo_inicial: string;
  valor_lancamento: number | null;
  valor_titulo: number | null;
  cod_titulo: string | null;
  status: "nova" | "investigando" | "aguardando_aprovacao" | "resolvida";
};

const COLUNAS_DIVERGENCIAS: { chave: Divergencia["status"]; titulo: string }[] = [
  { chave: "nova", titulo: "Nova" },
  { chave: "investigando", titulo: "Investigando" },
  { chave: "aguardando_aprovacao", titulo: "Aguardando aprovação" },
  { chave: "resolvida", titulo: "Resolvida" },
];

export default function FinanceiroApp() {
  const [arquivoExtrato, setArquivoExtrato] = useState<File | null>(null);
  const [arquivoTitulos, setArquivoTitulos] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [conciliando, setConciliando] = useState(false);

  const [extratoId, setExtratoId] = useState<string | null>(null);
  const [antes, setAntes] = useState<string[]>([]);
  const [depois, setDepois] = useState<string[]>([]);
  const [bateram, setBateram] = useState<LancamentoBatido[]>([]);
  const [ignorados, setIgnorados] = useState<LancamentoIgnorado[]>([]);
  const [divergencias, setDivergencias] = useState<Divergencia[]>([]);
  const [relatorioMarkdown, setRelatorioMarkdown] = useState<string | null>(null);
  const [aba, setAba] = useState<"importar" | "relatorio" | "aprovacoes">("importar");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!extratoId) return;
    const supabase = criarClienteNavegador();

    const canal = supabase
      .channel(`divergencias_${extratoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "divergencias", filter: `extrato_id=eq.${extratoId}` },
        (payload) => {
          const nova = payload.new as Divergencia;
          setDivergencias((atual) => {
            const existe = atual.some((d) => d.id === nova.id);
            return existe ? atual.map((d) => (d.id === nova.id ? nova : d)) : [...atual, nova];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [extratoId]);

  async function importar() {
    if (!arquivoExtrato) {
      alert("Selecione o arquivo do extrato.");
      return;
    }
    setImportando(true);
    setErro(null);
    try {
      const formData = new FormData();
      formData.append("arquivo_extrato", arquivoExtrato);
      if (arquivoTitulos) formData.append("arquivo_titulos", arquivoTitulos);

      const resposta = await fetch("/api/financeiro/importar", { method: "POST", body: formData });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro);
        return;
      }
      setExtratoId(dados.extrato_id);
      setAntes(dados.antes);
      setDepois(dados.depois);
      setBateram(dados.bateram);
      setIgnorados(dados.ignorados);
      setDivergencias(dados.divergencias);
      setRelatorioMarkdown(null);
    } finally {
      setImportando(false);
    }
  }

  async function conciliar() {
    if (!extratoId) return;
    setConciliando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/financeiro/conciliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extrato_id: extratoId }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro);
        return;
      }
      setRelatorioMarkdown(dados.relatorio?.relatorio_markdown ?? null);
      setAba("relatorio");
    } finally {
      setConciliando(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        {extratoId ? (
          <Organograma area="financeiro" item_id={extratoId} />
        ) : (
          <p className="p-6 text-center text-sm text-zinc-400">
            Importe um extrato para ver o organograma da conciliação.
          </p>
        )}
      </div>

      <div className="flex gap-4 border-b border-zinc-200 px-4 dark:border-zinc-800">
        {(["importar", "relatorio", "aprovacoes"] as const).map((chave) => (
          <button
            key={chave}
            onClick={() => setAba(chave)}
            className={`border-b-2 py-2 text-sm font-medium capitalize ${
              aba === chave ? "border-zinc-900 dark:border-zinc-100" : "border-transparent text-zinc-500"
            }`}
          >
            {chave === "importar" ? "Importar" : chave === "relatorio" ? "Relatório" : "Aprovações"}
          </button>
        ))}
      </div>

      {aba === "aprovacoes" && <FilaAprovacao area="financeiro" />}

      {aba === "relatorio" && (
        <div className="flex-1 overflow-y-auto p-6">
          {relatorioMarkdown ? (
            <pre className="whitespace-pre-wrap text-sm">{relatorioMarkdown}</pre>
          ) : (
            <p className="text-sm text-zinc-400">
              Nenhum relatório ainda. Importe um extrato e clique em Conciliar.
            </p>
          )}
        </div>
      )}

      {aba === "importar" && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-wrap items-end gap-4 rounded border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Extrato bancário (obrigatório)</label>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={(evento) => setArquivoExtrato(evento.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Títulos (opcional)</label>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={(evento) => setArquivoTitulos(evento.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </div>
            <button
              onClick={importar}
              disabled={importando}
              className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {importando ? "Importando..." : "Importar"}
            </button>
            {extratoId && (
              <button
                onClick={conciliar}
                disabled={conciliando}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {conciliando ? "Conciliando..." : "Conciliar"}
              </button>
            )}
          </div>

          {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}

          {antes.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-1 text-sm font-semibold">Antes (arquivo original)</h3>
                <pre className="overflow-x-auto rounded border border-zinc-200 p-2 text-xs dark:border-zinc-800">
                  {antes.join("\n")}
                </pre>
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold">Depois (normalizado)</h3>
                <pre className="overflow-x-auto rounded border border-zinc-200 p-2 text-xs dark:border-zinc-800">
                  {depois.join("\n")}
                </pre>
              </div>
            </div>
          )}

          {extratoId && (
            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  Bateram ({bateram.length})
                </h3>
                <div className="flex flex-col gap-2">
                  {bateram.map((l) => (
                    <div
                      key={l.cod_lancamento}
                      className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs dark:border-emerald-900 dark:bg-emerald-950"
                    >
                      <p className="font-medium">{l.descricao}</p>
                      <p>
                        {l.data} · R$ {l.valor.toFixed(2)} · {l.cod_titulo}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Divergências ({divergencias.length})</h3>
                <div className="flex flex-col gap-3">
                  {COLUNAS_DIVERGENCIAS.map((coluna) => (
                    <div key={coluna.chave}>
                      <h4 className="text-xs font-medium text-zinc-500">{coluna.titulo}</h4>
                      <div className="mt-1 flex flex-col gap-2">
                        {divergencias
                          .filter((d) => d.status === coluna.chave)
                          .map((d) => (
                            <div
                              key={d.id}
                              className="rounded border border-zinc-200 p-2 text-xs dark:border-zinc-800"
                            >
                              <p className="font-medium">{d.tipo_inicial}</p>
                              <p>
                                R$ {(d.valor_lancamento ?? d.valor_titulo ?? 0).toFixed(2)}
                                {d.cod_titulo ? ` · ${d.cod_titulo}` : ""}
                              </p>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-500">Ignorados ({ignorados.length})</h3>
                <div className="flex flex-col gap-2">
                  {ignorados.map((l) => (
                    <div
                      key={l.cod_lancamento}
                      className="rounded border border-zinc-200 p-2 text-xs dark:border-zinc-800"
                    >
                      <p className="font-medium">{l.descricao}</p>
                      <p>
                        {l.data} · R$ {l.valor.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
