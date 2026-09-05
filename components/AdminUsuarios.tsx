"use client";

import { useState, type FormEvent } from "react";

export type Perfil = {
  id: string;
  email: string;
  nome: string | null;
  papel: string;
  areas: string[];
  deve_trocar_senha: boolean;
};

const AREAS_DISPONIVEIS = [
  { chave: "vendas", nome: "Vendas" },
  { chave: "financeiro", nome: "Financeiro" },
];

function SeletorAreas({
  areas,
  aoAlternar,
}: {
  areas: string[];
  aoAlternar: (area: string) => void;
}) {
  return (
    <div className="flex gap-4">
      {AREAS_DISPONIVEIS.map((area) => (
        <label key={area.chave} className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={areas.includes(area.chave)}
            onChange={() => aoAlternar(area.chave)}
          />
          {area.nome}
        </label>
      ))}
    </div>
  );
}

function LinhaEdicao({
  perfil,
  onSalvar,
  onCancelar,
}: {
  perfil: Perfil;
  onSalvar: (atualizado: Perfil) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(perfil.nome ?? "");
  const [papel, setPapel] = useState<"admin" | "operador">(perfil.papel === "admin" ? "admin" : "operador");
  const [areas, setAreas] = useState<string[]>(perfil.areas ?? []);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function alternarArea(area: string) {
    setAreas((atual) => (atual.includes(area) ? atual.filter((a) => a !== area) : [...atual, area]));
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const resposta = await fetch(`/api/admin/usuarios/${perfil.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, papel, areas }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro ?? "Erro ao salvar.");
        return;
      }
      onSalvar(dados.perfil as Perfil);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <tr className="border-b border-zinc-100 bg-zinc-50 last:border-0 dark:border-zinc-900 dark:bg-zinc-900/50">
      <td className="px-3 py-2 align-top text-zinc-500">{perfil.email}</td>
      <td className="px-3 py-2 align-top">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </td>
      <td className="px-3 py-2 align-top">
        <select
          value={papel}
          onChange={(e) => setPapel(e.target.value as "admin" | "operador")}
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="operador">Operador</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td className="px-3 py-2 align-top">
        <SeletorAreas areas={areas} aoAlternar={alternarArea} />
        {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={salvando}
            onClick={salvar}
            className="rounded bg-black px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={onCancelar}
            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
          >
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function AdminUsuarios({ perfisIniciais }: { perfisIniciais: Perfil[] }) {
  const [perfis, setPerfis] = useState<Perfil[]>(perfisIniciais);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [resetandoId, setResetandoId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<"admin" | "operador">("operador");
  const [areas, setAreas] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function alternarArea(area: string) {
    setAreas((atual) =>
      atual.includes(area) ? atual.filter((a) => a !== area) : [...atual, area]
    );
  }

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resposta = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha, nome, papel, areas }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro ?? "Erro ao criar usuário.");
        return;
      }
      setPerfis((atual) => [...atual, dados.perfil as Perfil]);
      setEmail("");
      setSenha("");
      setNome("");
      setPapel("operador");
      setAreas([]);
    } finally {
      setEnviando(false);
    }
  }

  function aoSalvarEdicao(atualizado: Perfil) {
    setPerfis((atual) => atual.map((p) => (p.id === atualizado.id ? atualizado : p)));
    setEditandoId(null);
  }

  async function resetarSenha(perfil: Perfil) {
    if (!confirm(`Gerar uma senha temporária para ${perfil.email}?`)) return;
    setResetandoId(perfil.id);
    try {
      const resposta = await fetch(`/api/admin/usuarios/${perfil.id}/resetar-senha`, {
        method: "POST",
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        alert(`Erro: ${dados.erro}`);
        return;
      }
      setPerfis((atual) =>
        atual.map((p) => (p.id === perfil.id ? { ...p, deve_trocar_senha: true } : p))
      );
      alert(
        `Senha temporária de ${perfil.email}: ${dados.senha_temporaria}\n\nRepasse ao usuário — ele vai precisar trocá-la no próximo login.`
      );
    } finally {
      setResetandoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <th className="px-3 py-2">E-mail</th>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Papel</th>
              <th className="px-3 py-2">Áreas</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {perfis.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-zinc-400">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}
            {perfis.map((p) =>
              editandoId === p.id ? (
                <LinhaEdicao
                  key={p.id}
                  perfil={p}
                  onSalvar={aoSalvarEdicao}
                  onCancelar={() => setEditandoId(null)}
                />
              ) : (
                <tr key={p.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="px-3 py-2">{p.email}</td>
                  <td className="px-3 py-2">{p.nome}</td>
                  <td className="px-3 py-2">{p.papel}</td>
                  <td className="px-3 py-2">
                    {p.areas?.join(", ") || "—"}
                    {p.deve_trocar_senha && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        senha temporária pendente
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditandoId(p.id)}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={resetandoId === p.id}
                        onClick={() => resetarSenha(p)}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700"
                      >
                        {resetandoId === p.id ? "Gerando..." : "Resetar senha"}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={criar} className="flex w-full max-w-sm flex-col gap-3">
        <h2 className="font-semibold">Novo usuário</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="senha" className="text-sm">
            Senha inicial
          </label>
          <input
            id="senha"
            type="text"
            required
            minLength={6}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="nome" className="text-sm">
            Nome
          </label>
          <input
            id="nome"
            type="text"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="papel" className="text-sm">
            Papel
          </label>
          <select
            id="papel"
            value={papel}
            onChange={(e) => setPapel(e.target.value as "admin" | "operador")}
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="operador">Operador</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm">Áreas</span>
          <SeletorAreas areas={areas} aoAlternar={alternarArea} />
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {enviando ? "Criando..." : "Criar usuário"}
        </button>
      </form>
    </div>
  );
}
