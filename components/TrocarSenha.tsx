"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function TrocarSenha() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (senha.length < 6) {
      setErro("A senha precisa ter ao menos 6 caracteres.");
      return;
    }
    if (senha !== confirmar) {
      setErro("As senhas não coincidem.");
      return;
    }

    setEnviando(true);
    try {
      const resposta = await fetch("/api/trocar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha_nova: senha }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro ?? "Erro ao trocar senha.");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="senha" className="text-sm">
          Nova senha
        </label>
        <input
          id="senha"
          type="password"
          required
          minLength={6}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="confirmar" className="text-sm">
          Confirmar nova senha
        </label>
        <input
          id="confirmar"
          type="password"
          required
          minLength={6}
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {enviando ? "Salvando..." : "Salvar nova senha"}
      </button>
    </form>
  );
}
