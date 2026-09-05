import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { exigirArea } from "@/lib/supabase/exigirArea";
import { limparExtrato, limparTitulos, type LinhaLancamento } from "@/lib/financeiro/limpar";
import { casarLancamentos, type TituloParaCasamento } from "@/lib/financeiro/casar";

export async function POST(request: Request) {
  const acesso = await exigirArea("financeiro");
  if ("erro" in acesso) return acesso.erro;
  const { user } = acesso;

  const formData = await request.formData();
  const arquivoExtrato = formData.get("arquivo_extrato") as File | null;
  const arquivoTitulos = formData.get("arquivo_titulos") as File | null;

  if (!arquivoExtrato) {
    return NextResponse.json({ erro: "arquivo_extrato e obrigatorio" }, { status: 400 });
  }

  const supabase = criarClienteAdmin();

  let linhas: LinhaLancamento[];
  let antesPreview: string[];
  let depoisPreview: string[];
  try {
    const bytesExtrato = new Uint8Array(await arquivoExtrato.arrayBuffer());
    const resultadoLimpeza = limparExtrato(bytesExtrato);
    linhas = resultadoLimpeza.linhas;
    antesPreview = resultadoLimpeza.antesPreview;
    depoisPreview = resultadoLimpeza.depoisPreview;
  } catch (erro) {
    return NextResponse.json({ erro: `Falha ao limpar extrato: ${(erro as Error).message}` }, { status: 400 });
  }

  if (linhas.length === 0) {
    return NextResponse.json({ erro: "Nenhum lancamento encontrado no extrato." }, { status: 400 });
  }

  let titulos: TituloParaCasamento[];
  if (arquivoTitulos) {
    const bytesTitulos = new Uint8Array(await arquivoTitulos.arrayBuffer());
    titulos = limparTitulos(bytesTitulos);
  } else {
    const { data } = await supabase
      .from("TB_TITULOS")
      .select("cod_titulo, cod_cliente, nota_fiscal, valor, emissao, vencimento, status");
    titulos = (data as TituloParaCasamento[]) ?? [];
  }

  const { data: clientesData } = await supabase.from("TB_CLIENTES").select("cod_cliente, nome");
  const clientes = clientesData ?? [];

  const dataFinalExtrato = linhas.reduce((max, l) => (l.data > max ? l.data : max), linhas[0].data);
  const resultado = casarLancamentos(linhas, titulos, clientes, dataFinalExtrato);

  const totalCreditos = linhas.filter((l) => l.tipo === "credito").length;

  const { data: extrato, error: erroExtrato } = await supabase
    .from("extratos_importados")
    .insert({
      nome_arquivo: arquivoExtrato.name,
      importado_por: user?.id ?? null,
      total_linhas: linhas.length,
      total_creditos: totalCreditos,
    })
    .select("id")
    .single();

  if (erroExtrato || !extrato) {
    return NextResponse.json({ erro: `Falha ao registrar extrato: ${erroExtrato?.message}` }, { status: 500 });
  }

  const extratoId = extrato.id as string;

  const situacaoPorCod = new Map<string, { situacao: string; cod_titulo_casado: string | null }>();
  resultado.casados.forEach((c) =>
    situacaoPorCod.set(c.lancamento.cod_lancamento, { situacao: "casado", cod_titulo_casado: c.cod_titulo })
  );
  resultado.divergentes.forEach((d) =>
    situacaoPorCod.set(d.lancamento.cod_lancamento, { situacao: "divergente", cod_titulo_casado: null })
  );
  resultado.ignorados.forEach((l) =>
    situacaoPorCod.set(l.cod_lancamento, { situacao: "ignorado", cod_titulo_casado: null })
  );

  const { data: lancamentosInseridos, error: erroLancamentos } = await supabase
    .from("lancamentos")
    .insert(
      linhas.map((l) => ({
        extrato_id: extratoId,
        data: l.data,
        descricao: l.descricao,
        valor: l.valor,
        tipo: l.tipo,
        cod_titulo_casado: situacaoPorCod.get(l.cod_lancamento)?.cod_titulo_casado ?? null,
        situacao: situacaoPorCod.get(l.cod_lancamento)?.situacao ?? "ignorado",
      }))
    )
    .select("id, data, descricao, valor");

  if (erroLancamentos || !lancamentosInseridos) {
    return NextResponse.json({ erro: `Falha ao gravar lancamentos: ${erroLancamentos?.message}` }, { status: 500 });
  }

  const idPorCod = new Map<string, string>();
  linhas.forEach((l, indice) => idPorCod.set(l.cod_lancamento, lancamentosInseridos[indice].id));

  const divergenciasParaInserir = [
    ...resultado.divergentes.map((d) => ({
      extrato_id: extratoId,
      tipo_inicial: d.tipo_inicial,
      lancamento_id: idPorCod.get(d.lancamento.cod_lancamento) ?? null,
      cod_titulo: d.titulo_relacionado?.cod_titulo ?? d.titulos_relacionados?.map((t) => t.cod_titulo).join(",") ?? null,
      valor_lancamento: d.lancamento.valor,
      valor_titulo:
        d.titulo_relacionado?.valor ?? (d.titulos_relacionados ? d.titulos_relacionados.reduce((s, t) => s + t.valor, 0) : null),
      status: "nova",
    })),
    ...resultado.vencidosSemPagamento.map((t) => ({
      extrato_id: extratoId,
      tipo_inicial: "vencido_sem_pagamento" as const,
      lancamento_id: null,
      cod_titulo: t.cod_titulo,
      valor_lancamento: null,
      valor_titulo: t.valor,
      status: "nova",
    })),
  ];

  let divergenciasInseridas: { id: string; tipo_inicial: string; valor_lancamento: number | null; valor_titulo: number | null; cod_titulo: string | null; status: string }[] = [];
  if (divergenciasParaInserir.length > 0) {
    const { data, error: erroDivergencias } = await supabase
      .from("divergencias")
      .insert(divergenciasParaInserir)
      .select("id, tipo_inicial, valor_lancamento, valor_titulo, cod_titulo, status");

    if (erroDivergencias) {
      return NextResponse.json({ erro: `Falha ao gravar divergencias: ${erroDivergencias.message}` }, { status: 500 });
    }
    divergenciasInseridas = data ?? [];
  }

  return NextResponse.json({
    extrato_id: extratoId,
    antes: antesPreview,
    depois: depoisPreview,
    bateram: resultado.casados.map((c) => ({
      cod_lancamento: c.lancamento.cod_lancamento,
      data: c.lancamento.data,
      descricao: c.lancamento.descricao,
      valor: c.lancamento.valor,
      cod_titulo: c.cod_titulo,
    })),
    divergencias: divergenciasInseridas,
    ignorados: resultado.ignorados,
  });
}
